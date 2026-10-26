/* =============================================================================
   Stored procedures for reporting and integration consumers (SSRS, SSIS, Power BI)
   that read the same data the API serves through EF Core.
   ============================================================================= */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* Caseworker queue: filtered, sorted and paged on the server.
   Sorting uses a whitelist (CASE expressions) - never dynamic SQL built from user input. */
CREATE OR ALTER PROCEDURE dbo.usp_GetCaseQueue
    @Search    NVARCHAR(60) = NULL,
    @Status    NVARCHAR(30) = NULL,
    @Program   NVARCHAR(40) = NULL,
    @SortBy    VARCHAR(20)  = 'opened',   -- caseNumber | beneficiary | program | status | priority | opened
    @SortDir   VARCHAR(4)   = 'desc',     -- asc | desc
    @Page      INT          = 1,
    @PageSize  INT          = 10
AS
BEGIN
    SET NOCOUNT ON;

    IF @Page < 1 SET @Page = 1;
    IF @PageSize NOT BETWEEN 5 AND 50 SET @PageSize = 10;
    IF @SortBy NOT IN ('caseNumber', 'beneficiary', 'program', 'status', 'priority', 'opened') SET @SortBy = 'opened';
    IF @SortDir NOT IN ('asc', 'desc') SET @SortDir = 'desc';

    DECLARE @Term NVARCHAR(62) = CASE WHEN NULLIF(LTRIM(RTRIM(@Search)), N'') IS NULL
                                      THEN NULL ELSE N'%' + LTRIM(RTRIM(@Search)) + N'%' END;

    ;WITH Filtered AS
    (
        SELECT  c.Id, c.CaseNumber, b.FirstName, b.LastName, c.Program, c.Status, c.Priority,
                c.AssignedWorker, c.OpenedUtc,
                PendingAuthorizations = (SELECT COUNT(*) FROM dbo.ServiceAuthorization a
                                         WHERE a.CaseRecordId = c.Id AND a.Status = N'Pending')
        FROM    dbo.CaseRecord c
        JOIN    dbo.Beneficiary b ON b.Id = c.BeneficiaryId
        WHERE   (@Status  IS NULL OR c.Status  = @Status)
          AND   (@Program IS NULL OR c.Program = @Program)
          AND   (@Term    IS NULL OR c.CaseNumber LIKE @Term OR b.LastName LIKE @Term OR b.FirstName LIKE @Term)
    )
    SELECT  Id, CaseNumber, BeneficiaryName = FirstName + N' ' + LastName, Program, Status, Priority,
            AssignedWorker, OpenedUtc, PendingAuthorizations,
            TotalCount = COUNT(*) OVER ()
    FROM    Filtered
    ORDER BY
        CASE WHEN @SortDir = 'asc' AND @SortBy = 'caseNumber'  THEN CaseNumber END ASC,
        CASE WHEN @SortDir = 'desc' AND @SortBy = 'caseNumber' THEN CaseNumber END DESC,
        CASE WHEN @SortDir = 'asc' AND @SortBy = 'beneficiary'  THEN LastName + N' ' + FirstName END ASC,
        CASE WHEN @SortDir = 'desc' AND @SortBy = 'beneficiary' THEN LastName + N' ' + FirstName END DESC,
        CASE WHEN @SortDir = 'asc' AND @SortBy = 'program'  THEN Program END ASC,
        CASE WHEN @SortDir = 'desc' AND @SortBy = 'program' THEN Program END DESC,
        CASE WHEN @SortDir = 'asc' AND @SortBy = 'status'  THEN Status END ASC,
        CASE WHEN @SortDir = 'desc' AND @SortBy = 'status' THEN Status END DESC,
        CASE WHEN @SortDir = 'asc' AND @SortBy = 'priority'  THEN Priority END ASC,
        CASE WHEN @SortDir = 'desc' AND @SortBy = 'priority' THEN Priority END DESC,
        CASE WHEN @SortDir = 'asc' AND @SortBy = 'opened'  THEN OpenedUtc END ASC,
        CASE WHEN @SortDir = 'desc' AND @SortBy = 'opened' THEN OpenedUtc END DESC,
        CaseNumber ASC
    OFFSET (@Page - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END;
GO

/* Records a decision and its audit row atomically. Returns 0 = success, 1 = not found, 2 = already decided. */
CREATE OR ALTER PROCEDURE dbo.usp_DecideServiceAuthorization
    @CaseRecordId     INT,
    @AuthorizationId  INT,
    @Decision         NVARCHAR(20),
    @Reason           NVARCHAR(500) = NULL,
    @Actor            NVARCHAR(120),
    @CorrelationId    NVARCHAR(64)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Decision NOT IN (N'Approved', N'Denied')
        THROW 50001, N'Decision must be Approved or Denied.', 1;
    IF @Decision = N'Denied' AND NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL
        THROW 50002, N'A denial requires a reason.', 1;

    BEGIN TRANSACTION;

    DECLARE @Current NVARCHAR(20);
    SELECT  @Current = Status
    FROM    dbo.ServiceAuthorization WITH (UPDLOCK, HOLDLOCK)   -- serialize concurrent decisions
    WHERE   Id = @AuthorizationId AND CaseRecordId = @CaseRecordId;

    IF @Current IS NULL BEGIN ROLLBACK; RETURN 1; END;
    IF @Current <> N'Pending' BEGIN ROLLBACK; RETURN 2; END;

    UPDATE  dbo.ServiceAuthorization
    SET     Status = @Decision,
            DecisionReason = NULLIF(LTRIM(RTRIM(@Reason)), N''),
            DecidedBy = @Actor,
            DecidedUtc = SYSUTCDATETIME()
    WHERE   Id = @AuthorizationId;

    INSERT dbo.AuditEntry (TimestampUtc, Actor, Action, EntityType, EntityId, Details, CorrelationId)
    VALUES (SYSUTCDATETIME(), @Actor, N'Authorization' + @Decision, N'ServiceAuthorization',
            CAST(@AuthorizationId AS NVARCHAR(40)), N'Case ' + CAST(@CaseRecordId AS NVARCHAR(20)), @CorrelationId);

    COMMIT;
    RETURN 0;
END;
GO

/* Operational report: pending authorizations by program and age bucket (for supervisors' dashboard). */
CREATE OR ALTER VIEW dbo.vw_PendingAuthorizationAging
AS
SELECT  c.Program,
        AgeBucket = CASE
            WHEN DATEDIFF(DAY, c.OpenedUtc, SYSUTCDATETIME()) <= 30 THEN N'0-30 days'
            WHEN DATEDIFF(DAY, c.OpenedUtc, SYSUTCDATETIME()) <= 60 THEN N'31-60 days'
            ELSE N'Over 60 days' END,
        PendingCount = COUNT(*)
FROM    dbo.ServiceAuthorization a
JOIN    dbo.CaseRecord c ON c.Id = a.CaseRecordId
WHERE   a.Status = N'Pending'
GROUP BY c.Program,
        CASE
            WHEN DATEDIFF(DAY, c.OpenedUtc, SYSUTCDATETIME()) <= 30 THEN N'0-30 days'
            WHEN DATEDIFF(DAY, c.OpenedUtc, SYSUTCDATETIME()) <= 60 THEN N'31-60 days'
            ELSE N'Over 60 days' END;
GO

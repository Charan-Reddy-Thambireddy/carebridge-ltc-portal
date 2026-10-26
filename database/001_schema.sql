/* =============================================================================
   CareBridge LTC Portal - SQL Server schema
   Matches the EF Core model in src/CareBridge.Api/Data/CareBridgeDbContext.cs.
   Fictional demonstration schema; no real agency data.
   ============================================================================= */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.Beneficiary', N'U') IS NULL
CREATE TABLE dbo.Beneficiary
(
    Id                       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Beneficiary PRIMARY KEY,
    FirstName                NVARCHAR(100)  NOT NULL,
    LastName                 NVARCHAR(100)  NOT NULL,
    DateOfBirth              DATE           NOT NULL,
    -- Encrypted by the application (ASP.NET Core Data Protection) before it reaches the database.
    -- Pair with Always Encrypted / TDE in production for defense in depth.
    MedicaidIdProtected      NVARCHAR(512)  NOT NULL,
    MedicaidIdLast4          NCHAR(4)       NOT NULL,
    County                   NVARCHAR(60)   NULL,
    PreferredLanguage        NVARCHAR(40)   NULL,
    NeedsInterpreter         BIT            NOT NULL CONSTRAINT DF_Beneficiary_NeedsInterpreter DEFAULT (0),
    CommunicationPreference  NVARCHAR(30)   NOT NULL CONSTRAINT DF_Beneficiary_CommPref DEFAULT (N'StandardPrint'),
    CONSTRAINT CK_Beneficiary_CommPref CHECK (CommunicationPreference IN
        (N'StandardPrint', N'LargePrint', N'Braille', N'AudioRecording', N'AccessibleElectronic', N'TtyRelay'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Beneficiary_LastName_FirstName')
    CREATE INDEX IX_Beneficiary_LastName_FirstName ON dbo.Beneficiary (LastName, FirstName);
GO

IF OBJECT_ID(N'dbo.CaseRecord', N'U') IS NULL
CREATE TABLE dbo.CaseRecord
(
    Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CaseRecord PRIMARY KEY,
    CaseNumber      NVARCHAR(20)   NOT NULL,
    BeneficiaryId   INT            NOT NULL CONSTRAINT FK_CaseRecord_Beneficiary REFERENCES dbo.Beneficiary (Id),
    Program         NVARCHAR(40)   NOT NULL,
    Status          NVARCHAR(30)   NOT NULL,
    Priority        NVARCHAR(20)   NOT NULL,
    AssignedWorker  NVARCHAR(120)  NULL,
    OpenedUtc       DATETIME2(0)   NOT NULL,
    NextReviewDate  DATE           NULL,
    CONSTRAINT UQ_CaseRecord_CaseNumber UNIQUE (CaseNumber),
    CONSTRAINT CK_CaseRecord_Program CHECK (Program IN
        (N'MedicaidLongTermCare', N'HomeAndCommunityBasedServices', N'MedicareSavingsProgram')),
    CONSTRAINT CK_CaseRecord_Status CHECK (Status IN
        (N'Intake', N'AssessmentScheduled', N'UnderReview', N'Approved', N'Denied', N'Reassessment')),
    CONSTRAINT CK_CaseRecord_Priority CHECK (Priority IN (N'Routine', N'Expedited', N'Urgent'))
);
GO

-- Supports the caseworker queue's default "status filter + newest first" access path.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_CaseRecord_Status_OpenedUtc')
    CREATE INDEX IX_CaseRecord_Status_OpenedUtc ON dbo.CaseRecord (Status, OpenedUtc DESC)
        INCLUDE (CaseNumber, BeneficiaryId, Program, Priority, AssignedWorker);
GO

IF OBJECT_ID(N'dbo.ServiceAuthorization', N'U') IS NULL
CREATE TABLE dbo.ServiceAuthorization
(
    Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ServiceAuthorization PRIMARY KEY,
    CaseRecordId    INT            NOT NULL CONSTRAINT FK_ServiceAuthorization_CaseRecord REFERENCES dbo.CaseRecord (Id),
    ServiceCode     NVARCHAR(10)   NOT NULL,
    ServiceName     NVARCHAR(120)  NOT NULL,
    UnitsPerWeek    INT            NOT NULL CONSTRAINT CK_ServiceAuthorization_Units CHECK (UnitsPerWeek BETWEEN 0 AND 168),
    StartDate       DATE           NOT NULL,
    EndDate         DATE           NOT NULL,
    Status          NVARCHAR(20)   NOT NULL CONSTRAINT DF_ServiceAuthorization_Status DEFAULT (N'Pending'),
    DecisionReason  NVARCHAR(500)  NULL,
    DecidedBy       NVARCHAR(120)  NULL,
    DecidedUtc      DATETIME2(0)   NULL,
    CONSTRAINT CK_ServiceAuthorization_Dates CHECK (EndDate >= StartDate),
    CONSTRAINT CK_ServiceAuthorization_Status CHECK (Status IN (N'Pending', N'Approved', N'Denied')),
    -- Business rule enforced at the database too: a denial must carry a reason.
    CONSTRAINT CK_ServiceAuthorization_DenialReason CHECK (Status <> N'Denied' OR DecisionReason IS NOT NULL)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ServiceAuthorization_CaseRecordId_Status')
    CREATE INDEX IX_ServiceAuthorization_CaseRecordId_Status ON dbo.ServiceAuthorization (CaseRecordId, Status);
GO

IF OBJECT_ID(N'dbo.CarePlanGoal', N'U') IS NULL
CREATE TABLE dbo.CarePlanGoal
(
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CarePlanGoal PRIMARY KEY,
    CaseRecordId  INT            NOT NULL CONSTRAINT FK_CarePlanGoal_CaseRecord REFERENCES dbo.CaseRecord (Id),
    Description   NVARCHAR(300)  NOT NULL,
    TargetDate    DATE           NOT NULL,
    Met           BIT            NOT NULL CONSTRAINT DF_CarePlanGoal_Met DEFAULT (0)
);
GO

IF OBJECT_ID(N'dbo.AuditEntry', N'U') IS NULL
CREATE TABLE dbo.AuditEntry
(
    Id             BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditEntry PRIMARY KEY,
    TimestampUtc   DATETIME2(3)   NOT NULL,
    Actor          NVARCHAR(120)  NOT NULL,
    Action         NVARCHAR(60)   NOT NULL,
    EntityType     NVARCHAR(60)   NOT NULL,
    EntityId       NVARCHAR(40)   NOT NULL,
    Details        NVARCHAR(MAX)  NULL,
    CorrelationId  NVARCHAR(64)   NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditEntry_EntityType_EntityId')
    CREATE INDEX IX_AuditEntry_EntityType_EntityId ON dbo.AuditEntry (EntityType, EntityId);
GO

-- Audit rows are append-only: block updates and deletes for everyone except the owner/DBA role.
CREATE OR ALTER TRIGGER dbo.TR_AuditEntry_AppendOnly ON dbo.AuditEntry
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51000, N'AuditEntry is append-only.', 1;
END;
GO

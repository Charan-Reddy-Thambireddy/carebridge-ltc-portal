namespace CareBridge.Api.Domain;

/// <summary>A person receiving (or applying for) benefits. All seed data is fictional.</summary>
public class Beneficiary
{
    public int Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateOnly DateOfBirth { get; set; }

    /// <summary>Medicaid ID encrypted at rest with ASP.NET Core Data Protection.</summary>
    public string MedicaidIdProtected { get; set; } = string.Empty;

    /// <summary>Last four characters, kept separately so lists can show a masked ID without decrypting.</summary>
    public string MedicaidIdLast4 { get; set; } = string.Empty;

    public string County { get; set; } = string.Empty;
    public string PreferredLanguage { get; set; } = "English";
    public bool NeedsInterpreter { get; set; }
    public CommunicationPreference CommunicationPreference { get; set; } = CommunicationPreference.StandardPrint;

    public List<CaseRecord> Cases { get; set; } = new();
}

public class CaseRecord
{
    public int Id { get; set; }
    public string CaseNumber { get; set; } = string.Empty;
    public int BeneficiaryId { get; set; }
    public Beneficiary Beneficiary { get; set; } = null!;
    public ProgramType Program { get; set; }
    public CaseStatus Status { get; set; }
    public CasePriority Priority { get; set; }
    public string AssignedWorker { get; set; } = string.Empty;
    public DateTime OpenedUtc { get; set; }
    public DateOnly? NextReviewDate { get; set; }

    public List<ServiceAuthorization> Authorizations { get; set; } = new();
    public List<CarePlanGoal> CarePlanGoals { get; set; } = new();
}

public class ServiceAuthorization
{
    public int Id { get; set; }
    public int CaseRecordId { get; set; }
    public CaseRecord CaseRecord { get; set; } = null!;
    public string ServiceCode { get; set; } = string.Empty;
    public string ServiceName { get; set; } = string.Empty;
    public int UnitsPerWeek { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public AuthorizationStatus Status { get; set; } = AuthorizationStatus.Pending;
    public string? DecisionReason { get; set; }
    public string? DecidedBy { get; set; }
    public DateTime? DecidedUtc { get; set; }
}

public class CarePlanGoal
{
    public int Id { get; set; }
    public int CaseRecordId { get; set; }
    public string Description { get; set; } = string.Empty;
    public DateOnly TargetDate { get; set; }
    public bool Met { get; set; }
}

/// <summary>Append-only audit trail for decisions on sensitive records.</summary>
public class AuditEntry
{
    public long Id { get; set; }
    public DateTime TimestampUtc { get; set; }
    public string Actor { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string CorrelationId { get; set; } = string.Empty;
}

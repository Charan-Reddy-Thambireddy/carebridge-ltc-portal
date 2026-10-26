using System.ComponentModel.DataAnnotations;
using CareBridge.Api.Domain;

namespace CareBridge.Api.Dtos;

public sealed class CaseQuery
{
    [StringLength(60)]
    public string? Search { get; set; }

    public CaseStatus? Status { get; set; }

    public ProgramType? Program { get; set; }

    /// <summary>caseNumber | beneficiary | program | status | priority | opened</summary>
    [RegularExpression("^(caseNumber|beneficiary|program|status|priority|opened)$",
        ErrorMessage = "Sort must be one of: caseNumber, beneficiary, program, status, priority, opened.")]
    public string Sort { get; set; } = "opened";

    [RegularExpression("^(asc|desc)$", ErrorMessage = "Direction must be asc or desc.")]
    public string Dir { get; set; } = "desc";

    [Range(1, 10_000)]
    public int Page { get; set; } = 1;

    [Range(5, 50)]
    public int PageSize { get; set; } = 10;
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
}

public sealed record CaseSummaryDto(
    int Id,
    string CaseNumber,
    string BeneficiaryName,
    ProgramType Program,
    CaseStatus Status,
    CasePriority Priority,
    string AssignedWorker,
    DateTime OpenedUtc,
    int PendingAuthorizations);

public sealed record BeneficiaryDto(
    string FullName,
    DateOnly DateOfBirth,
    string MaskedMedicaidId,
    string MedicaidIdLast4,
    string County,
    string PreferredLanguage,
    bool NeedsInterpreter,
    CommunicationPreference CommunicationPreference);

public sealed record ServiceAuthorizationDto(
    int Id,
    string ServiceCode,
    string ServiceName,
    int UnitsPerWeek,
    DateOnly StartDate,
    DateOnly EndDate,
    AuthorizationStatus Status,
    string? DecisionReason,
    string? DecidedBy,
    DateTime? DecidedUtc);

public sealed record CarePlanGoalDto(int Id, string Description, DateOnly TargetDate, bool Met);

public sealed record CaseDetailDto(
    int Id,
    string CaseNumber,
    ProgramType Program,
    CaseStatus Status,
    CasePriority Priority,
    string AssignedWorker,
    DateTime OpenedUtc,
    DateOnly? NextReviewDate,
    BeneficiaryDto Beneficiary,
    IReadOnlyList<ServiceAuthorizationDto> Authorizations,
    IReadOnlyList<CarePlanGoalDto> CarePlanGoals);

public sealed class AuthorizationDecisionRequest : IValidatableObject
{
    [Required(ErrorMessage = "Select a decision.")]
    public AuthorizationStatus? Decision { get; set; }

    [StringLength(500, ErrorMessage = "Reason must be 500 characters or fewer.")]
    public string? Reason { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Decision == AuthorizationStatus.Pending)
        {
            yield return new ValidationResult("Select Approve or Deny.", new[] { nameof(Decision) });
        }

        // A denial must explain why: beneficiaries have a right to a notice with the reason and appeal rights.
        if (Decision == AuthorizationStatus.Denied && string.IsNullOrWhiteSpace(Reason))
        {
            yield return new ValidationResult(
                "Enter a reason for the denial. The reason is included in the notice sent to the beneficiary.",
                new[] { nameof(Reason) });
        }
    }
}

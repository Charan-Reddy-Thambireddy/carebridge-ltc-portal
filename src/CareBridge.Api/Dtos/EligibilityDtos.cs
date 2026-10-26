using System.ComponentModel.DataAnnotations;
using CareBridge.Api.Domain;

namespace CareBridge.Api.Dtos;

/// <summary>
/// Input for the anonymous eligibility pre-screener. Validation messages are written
/// in plain language because they are shown (and announced) to the public.
/// </summary>
public sealed class EligibilityScreeningRequest : IValidatableObject
{
    [Required(ErrorMessage = "Enter your age.")]
    [Range(0, 120, ErrorMessage = "Age must be a number between 0 and 120.")]
    public int? Age { get; set; }

    [Required(ErrorMessage = "Enter how many people live in your household.")]
    [Range(1, 12, ErrorMessage = "Household size must be between 1 and 12.")]
    public int? HouseholdSize { get; set; }

    [Required(ErrorMessage = "Enter your total monthly income before taxes. Enter 0 if you have none.")]
    [Range(typeof(decimal), "0", "1000000", ErrorMessage = "Monthly income must be 0 or more.")]
    public decimal? MonthlyIncome { get; set; }

    [Required(ErrorMessage = "Enter the total value of your countable assets. Enter 0 if you have none.")]
    [Range(typeof(decimal), "0", "100000000", ErrorMessage = "Countable assets must be 0 or more.")]
    public decimal? CountableAssets { get; set; }

    [Required(ErrorMessage = "Select whether you have a disability.")]
    public bool? HasDisability { get; set; }

    [Required(ErrorMessage = "Select whether you have Medicare Part A.")]
    public bool? HasMedicarePartA { get; set; }

    /// <summary>Number of activities of daily living (bathing, dressing, eating, etc.) needing help: 0-6.</summary>
    [Range(0, 6, ErrorMessage = "Select between 0 and 6 daily activities.")]
    public int DailyActivitiesNeedingHelp { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (HasMedicarePartA == true && Age is < 18)
        {
            yield return new ValidationResult(
                "Check your age. Medicare Part A is usually available at 65 or older, or earlier with a qualifying disability.",
                new[] { nameof(Age) });
        }
    }
}

public sealed record ProgramScreeningResult(
    ProgramType Program,
    string ProgramName,
    bool MayQualify,
    IReadOnlyList<string> Reasons,
    string NextStep);

public sealed record EligibilityScreeningResponse(
    IReadOnlyList<ProgramScreeningResult> Results,
    string Disclaimer);

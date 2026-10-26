using System.Globalization;
using CareBridge.Api.Domain;
using CareBridge.Api.Dtos;
using Microsoft.Extensions.Options;

namespace CareBridge.Api.Services;

/// <summary>
/// Illustrative screening thresholds, bound from configuration ("EligibilityRules").
/// These are SAMPLE values for a demo, not real Medicaid/Medicare policy for any state.
/// </summary>
public sealed class EligibilityRulesOptions
{
    public const string SectionName = "EligibilityRules";

    public decimal LongTermCareMonthlyIncomeLimit { get; set; } = 2901m;
    public decimal LongTermCareAssetLimit { get; set; } = 2000m;
    public int LongTermCareMinimumDailyActivities { get; set; } = 2;
    public int HcbsMinimumDailyActivities { get; set; } = 1;

    public decimal SavingsProgramBaseMonthlyIncome { get; set; } = 1325m;
    public decimal SavingsProgramPerAdditionalPerson { get; set; } = 465m;
    public decimal SavingsProgramAssetLimitSingle { get; set; } = 9660m;
    public decimal SavingsProgramAssetLimitCouple { get; set; } = 14470m;
}

public interface IEligibilityService
{
    EligibilityScreeningResponse Screen(EligibilityScreeningRequest request);
}

public sealed class EligibilityService : IEligibilityService
{
    public const string Disclaimer =
        "This is an estimate only, based on sample rules for a demonstration. It is not a decision. " +
        "Only a full application reviewed by the agency can determine eligibility.";

    private static readonly CultureInfo UsCulture = CultureInfo.GetCultureInfo("en-US");
    private readonly EligibilityRulesOptions _rules;

    public EligibilityService(IOptions<EligibilityRulesOptions> rules)
    {
        _rules = rules.Value;
    }

    public EligibilityScreeningResponse Screen(EligibilityScreeningRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var results = new List<ProgramScreeningResult>
        {
            ScreenLongTermCare(request),
            ScreenHomeAndCommunityBased(request),
            ScreenMedicareSavings(request)
        };

        return new EligibilityScreeningResponse(results, Disclaimer);
    }

    private ProgramScreeningResult ScreenLongTermCare(EligibilityScreeningRequest r)
    {
        var reasons = new List<string>();
        var categorical = (r.Age ?? 0) >= 65 || r.HasDisability == true;
        var income = (r.MonthlyIncome ?? 0) <= _rules.LongTermCareMonthlyIncomeLimit;
        var assets = (r.CountableAssets ?? 0) <= _rules.LongTermCareAssetLimit;
        var functional = r.DailyActivitiesNeedingHelp >= _rules.LongTermCareMinimumDailyActivities;

        reasons.Add(categorical
            ? "You are 65 or older, or you have a disability."
            : "This program is for people 65 or older, or people with a disability.");
        reasons.Add(income
            ? $"Your monthly income is at or below the sample limit of {Money(_rules.LongTermCareMonthlyIncomeLimit)}."
            : $"Your monthly income is above the sample limit of {Money(_rules.LongTermCareMonthlyIncomeLimit)}. Some people still qualify by spending down income on medical costs.");
        reasons.Add(assets
            ? $"Your countable assets are at or below the sample limit of {Money(_rules.LongTermCareAssetLimit)}."
            : $"Your countable assets are above the sample limit of {Money(_rules.LongTermCareAssetLimit)}.");
        reasons.Add(functional
            ? "You need help with enough daily activities to suggest a nursing-facility level of care."
            : $"This program usually requires help with at least {_rules.LongTermCareMinimumDailyActivities} daily activities.");

        var mayQualify = categorical && income && assets && functional;
        return new ProgramScreeningResult(
            ProgramType.MedicaidLongTermCare,
            "Medicaid long-term care",
            mayQualify,
            reasons,
            mayQualify
                ? "Start an application and request a functional assessment."
                : "You can still apply. A caseworker can review spend-down and other options with you.");
    }

    private ProgramScreeningResult ScreenHomeAndCommunityBased(EligibilityScreeningRequest r)
    {
        var reasons = new List<string>();
        var categorical = (r.Age ?? 0) >= 65 || r.HasDisability == true;
        var financial = (r.MonthlyIncome ?? 0) <= _rules.LongTermCareMonthlyIncomeLimit
                        && (r.CountableAssets ?? 0) <= _rules.LongTermCareAssetLimit;
        var functional = r.DailyActivitiesNeedingHelp >= _rules.HcbsMinimumDailyActivities;

        reasons.Add(categorical
            ? "You meet the age or disability requirement."
            : "Home and community-based services are for older adults and people with disabilities.");
        reasons.Add(financial
            ? "Your income and assets are within the sample limits."
            : "Your income or assets are above the sample limits.");
        reasons.Add(functional
            ? "You need help with at least one daily activity, so services at home may help."
            : "These services are for people who need help with daily activities.");

        var mayQualify = categorical && financial && functional;
        return new ProgramScreeningResult(
            ProgramType.HomeAndCommunityBasedServices,
            "Home and community-based services",
            mayQualify,
            reasons,
            mayQualify
                ? "Ask about in-home supports such as personal care, meals, and respite."
                : "Contact your local aging and disability resource center to explore other supports.");
    }

    private ProgramScreeningResult ScreenMedicareSavings(EligibilityScreeningRequest r)
    {
        var reasons = new List<string>();
        var household = Math.Max(1, r.HouseholdSize ?? 1);
        var incomeLimit = _rules.SavingsProgramBaseMonthlyIncome
                          + (_rules.SavingsProgramPerAdditionalPerson * (household - 1));
        var assetLimit = household >= 2 ? _rules.SavingsProgramAssetLimitCouple : _rules.SavingsProgramAssetLimitSingle;

        var hasPartA = r.HasMedicarePartA == true;
        var income = (r.MonthlyIncome ?? 0) <= incomeLimit;
        var assets = (r.CountableAssets ?? 0) <= assetLimit;

        reasons.Add(hasPartA
            ? "You have Medicare Part A."
            : "Medicare Savings Programs are for people who have, or can get, Medicare Part A.");
        reasons.Add(income
            ? $"Your income is at or below the sample limit of {Money(incomeLimit)} for a household of {household}."
            : $"Your income is above the sample limit of {Money(incomeLimit)} for a household of {household}.");
        reasons.Add(assets
            ? $"Your assets are at or below the sample limit of {Money(assetLimit)}."
            : $"Your assets are above the sample limit of {Money(assetLimit)}.");

        var mayQualify = hasPartA && income && assets;
        return new ProgramScreeningResult(
            ProgramType.MedicareSavingsProgram,
            "Medicare Savings Program",
            mayQualify,
            reasons,
            mayQualify
                ? "Apply to have help paying Medicare premiums, deductibles, and copays."
                : "A benefits counselor can check whether other help with Medicare costs is available.");
    }

    private static string Money(decimal value) => value.ToString("C0", UsCulture);
}

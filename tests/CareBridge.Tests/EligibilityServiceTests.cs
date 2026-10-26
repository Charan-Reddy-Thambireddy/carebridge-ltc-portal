using CareBridge.Api.Domain;
using CareBridge.Api.Dtos;
using CareBridge.Api.Services;
using Microsoft.Extensions.Options;

namespace CareBridge.Tests;

public class EligibilityServiceTests
{
    private static EligibilityService CreateService() => new(Options.Create(new EligibilityRulesOptions()));

    private static EligibilityScreeningRequest Request(
        int age = 72,
        int household = 1,
        decimal income = 1200m,
        decimal assets = 1500m,
        bool disability = false,
        bool partA = true,
        int adls = 3) => new()
    {
        Age = age,
        HouseholdSize = household,
        MonthlyIncome = income,
        CountableAssets = assets,
        HasDisability = disability,
        HasMedicarePartA = partA,
        DailyActivitiesNeedingHelp = adls
    };

    private static ProgramScreeningResult For(EligibilityScreeningResponse response, ProgramType program) =>
        response.Results.Single(r => r.Program == program);

    [Fact]
    public void Older_adult_with_low_income_and_care_needs_may_qualify_for_all_programs()
    {
        var response = CreateService().Screen(Request());

        Assert.All(response.Results, r => Assert.True(r.MayQualify, r.ProgramName));
        Assert.False(string.IsNullOrWhiteSpace(response.Disclaimer));
    }

    [Fact]
    public void Younger_adult_without_disability_does_not_meet_long_term_care_category()
    {
        var response = CreateService().Screen(Request(age: 40, disability: false, partA: false));

        var ltc = For(response, ProgramType.MedicaidLongTermCare);
        Assert.False(ltc.MayQualify);
        Assert.Contains(ltc.Reasons, reason => reason.Contains("65 or older", StringComparison.Ordinal));
    }

    [Fact]
    public void Disability_satisfies_category_requirement_under_65()
    {
        var response = CreateService().Screen(Request(age: 45, disability: true));

        Assert.True(For(response, ProgramType.MedicaidLongTermCare).MayQualify);
    }

    [Theory]
    [InlineData(2901, true)]  // exactly at the limit qualifies
    [InlineData(2902, false)] // one dollar over does not
    public void Long_term_care_income_limit_is_inclusive(decimal income, bool expected)
    {
        var response = CreateService().Screen(Request(income: income));

        Assert.Equal(expected, For(response, ProgramType.MedicaidLongTermCare).MayQualify);
    }

    [Fact]
    public void Home_and_community_services_need_only_one_daily_activity()
    {
        var response = CreateService().Screen(Request(adls: 1));

        Assert.False(For(response, ProgramType.MedicaidLongTermCare).MayQualify);
        Assert.True(For(response, ProgramType.HomeAndCommunityBasedServices).MayQualify);
    }

    [Theory]
    [InlineData(1, 1325, true)]
    [InlineData(1, 1326, false)]
    [InlineData(2, 1790, true)]  // 1325 + 465
    [InlineData(3, 2255, true)]  // 1325 + 2 * 465
    public void Medicare_savings_income_limit_scales_with_household_size(int household, decimal income, bool expected)
    {
        var response = CreateService().Screen(Request(household: household, income: income, assets: 0));

        Assert.Equal(expected, For(response, ProgramType.MedicareSavingsProgram).MayQualify);
    }

    [Fact]
    public void Medicare_savings_program_requires_part_a()
    {
        var response = CreateService().Screen(Request(partA: false));

        Assert.False(For(response, ProgramType.MedicareSavingsProgram).MayQualify);
    }

    [Fact]
    public void Reasons_use_us_currency_formatting_regardless_of_server_culture()
    {
        var response = CreateService().Screen(Request());

        Assert.Contains(For(response, ProgramType.MedicaidLongTermCare).Reasons,
            reason => reason.Contains("$2,901", StringComparison.Ordinal));
    }
}

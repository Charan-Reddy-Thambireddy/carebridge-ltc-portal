using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using CareBridge.Api.Dtos;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace CareBridge.Tests;

/// <summary>
/// End-to-end tests through the real HTTP pipeline (middleware, model validation,
/// controllers, EF Core) using the in-memory provider and fictional seed data.
/// </summary>
public class ApiIntegrationTests : IClassFixture<ApiIntegrationTests.Factory>
{
    public sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("InMemoryDatabaseName", "CareBridgeTests-" + Guid.NewGuid().ToString("N"));
            builder.UseEnvironment("Testing");
        }
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly HttpClient _client;

    public ApiIntegrationTests(Factory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Screen_returns_results_for_valid_input()
    {
        var response = await _client.PostAsJsonAsync("/api/eligibility/screen", new
        {
            age = 70,
            householdSize = 1,
            monthlyIncome = 1100,
            countableAssets = 500,
            hasDisability = false,
            hasMedicarePartA = true,
            dailyActivitiesNeedingHelp = 2
        });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<EligibilityScreeningResponse>(Json);
        Assert.NotNull(body);
        Assert.Equal(3, body!.Results.Count);
    }

    [Fact]
    public async Task Screen_returns_field_keyed_validation_errors_for_the_ui()
    {
        var response = await _client.PostAsJsonAsync("/api/eligibility/screen", new { householdSize = 0 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var errors = doc.RootElement.GetProperty("errors");

        // Keys must match form field names so the client can link each message to its input.
        Assert.True(errors.TryGetProperty("Age", out _));
        Assert.True(errors.TryGetProperty("HouseholdSize", out _));
        Assert.True(errors.TryGetProperty("MonthlyIncome", out _));
    }

    [Fact]
    public async Task Case_search_pages_and_filters()
    {
        var page = await _client.GetFromJsonAsync<PagedResult<CaseSummaryDto>>("/api/cases?page=1&pageSize=5", Json);

        Assert.NotNull(page);
        Assert.Equal(5, page!.Items.Count);
        Assert.Equal(24, page.TotalCount);
        Assert.Equal(5, page.TotalPages);
    }

    [Fact]
    public async Task Case_search_rejects_unknown_sort_column()
    {
        var response = await _client.GetAsync("/api/cases?sort=DROP%20TABLE");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Case_detail_masks_the_medicaid_id()
    {
        var detail = await _client.GetFromJsonAsync<CaseDetailDto>("/api/cases/1", Json);

        Assert.NotNull(detail);
        Assert.StartsWith("*****", detail!.Beneficiary.MaskedMedicaidId, StringComparison.Ordinal);
        Assert.Equal(9, detail.Beneficiary.MaskedMedicaidId.Length);
    }

    [Fact]
    public async Task Missing_case_returns_problem_details_with_correlation_id()
    {
        var response = await _client.GetAsync("/api/cases/99999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.True(response.Headers.Contains("X-Correlation-ID"));
    }

    [Fact]
    public async Task Denial_without_reason_is_rejected()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/cases/2/authorizations/" + await FirstPendingAuthorizationId(2) + "/decision",
            new { decision = "Denied", reason = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Approving_twice_returns_conflict()
    {
        var authId = await FirstPendingAuthorizationId(3);
        var url = $"/api/cases/3/authorizations/{authId}/decision";

        var first = await _client.PostAsJsonAsync(url, new { decision = "Approved" });
        var second = await _client.PostAsJsonAsync(url, new { decision = "Approved" });

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Pages_are_served_with_security_headers()
    {
        var response = await _client.GetAsync("/");

        response.EnsureSuccessStatusCode();
        Assert.True(response.Headers.Contains("Content-Security-Policy"));
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }

    private async Task<int> FirstPendingAuthorizationId(int caseId)
    {
        var detail = await _client.GetFromJsonAsync<CaseDetailDto>($"/api/cases/{caseId}", Json);
        return detail!.Authorizations.First(a => a.Status == CareBridge.Api.Domain.AuthorizationStatus.Pending).Id;
    }
}

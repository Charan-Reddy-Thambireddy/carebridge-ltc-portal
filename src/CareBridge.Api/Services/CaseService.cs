using CareBridge.Api.Data;
using CareBridge.Api.Domain;
using CareBridge.Api.Dtos;
using CareBridge.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace CareBridge.Api.Services;

public interface ICaseService
{
    Task<PagedResult<CaseSummaryDto>> SearchAsync(CaseQuery query, CancellationToken ct);
    Task<CaseDetailDto?> GetAsync(int id, CancellationToken ct);
    Task<DecisionOutcome> DecideAuthorizationAsync(int caseId, int authorizationId, AuthorizationDecisionRequest request, CancellationToken ct);
}

public enum DecisionResultKind
{
    Success,
    NotFound,
    AlreadyDecided
}

public sealed record DecisionOutcome(DecisionResultKind Kind, ServiceAuthorizationDto? Authorization = null);

public sealed class CaseService : ICaseService
{
    private readonly CareBridgeDbContext _db;
    private readonly IAuditLogger _audit;
    private readonly ICurrentUser _user;
    private readonly TimeProvider _clock;

    public CaseService(CareBridgeDbContext db, IAuditLogger audit, ICurrentUser user, TimeProvider clock)
    {
        _db = db;
        _audit = audit;
        _user = user;
        _clock = clock;
    }

    public async Task<PagedResult<CaseSummaryDto>> SearchAsync(CaseQuery query, CancellationToken ct)
    {
        IQueryable<CaseRecord> cases = _db.Cases.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            cases = cases.Where(c =>
                c.CaseNumber.Contains(term) ||
                c.Beneficiary.LastName.Contains(term) ||
                c.Beneficiary.FirstName.Contains(term));
        }

        if (query.Status is { } status)
        {
            cases = cases.Where(c => c.Status == status);
        }

        if (query.Program is { } program)
        {
            cases = cases.Where(c => c.Program == program);
        }

        var descending = string.Equals(query.Dir, "desc", StringComparison.OrdinalIgnoreCase);
        cases = (query.Sort, descending) switch
        {
            ("caseNumber", false) => cases.OrderBy(c => c.CaseNumber),
            ("caseNumber", true) => cases.OrderByDescending(c => c.CaseNumber),
            ("beneficiary", false) => cases.OrderBy(c => c.Beneficiary.LastName).ThenBy(c => c.Beneficiary.FirstName),
            ("beneficiary", true) => cases.OrderByDescending(c => c.Beneficiary.LastName).ThenByDescending(c => c.Beneficiary.FirstName),
            ("program", false) => cases.OrderBy(c => c.Program).ThenBy(c => c.CaseNumber),
            ("program", true) => cases.OrderByDescending(c => c.Program).ThenBy(c => c.CaseNumber),
            ("status", false) => cases.OrderBy(c => c.Status).ThenBy(c => c.CaseNumber),
            ("status", true) => cases.OrderByDescending(c => c.Status).ThenBy(c => c.CaseNumber),
            ("priority", false) => cases.OrderBy(c => c.Priority).ThenBy(c => c.CaseNumber),
            ("priority", true) => cases.OrderByDescending(c => c.Priority).ThenBy(c => c.CaseNumber),
            ("opened", false) => cases.OrderBy(c => c.OpenedUtc),
            _ => cases.OrderByDescending(c => c.OpenedUtc)
        };

        var total = await cases.CountAsync(ct);
        var items = await cases
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(c => new CaseSummaryDto(
                c.Id,
                c.CaseNumber,
                c.Beneficiary.FirstName + " " + c.Beneficiary.LastName,
                c.Program,
                c.Status,
                c.Priority,
                c.AssignedWorker,
                c.OpenedUtc,
                c.Authorizations.Count(a => a.Status == AuthorizationStatus.Pending)))
            .ToListAsync(ct);

        return new PagedResult<CaseSummaryDto>(items, query.Page, query.PageSize, total);
    }

    public async Task<CaseDetailDto?> GetAsync(int id, CancellationToken ct)
    {
        var c = await _db.Cases
            .AsNoTracking()
            .Include(x => x.Beneficiary)
            .Include(x => x.Authorizations)
            .Include(x => x.CarePlanGoals)
            .SingleOrDefaultAsync(x => x.Id == id, ct);

        if (c is null)
        {
            return null;
        }

        var b = c.Beneficiary;
        return new CaseDetailDto(
            c.Id,
            c.CaseNumber,
            c.Program,
            c.Status,
            c.Priority,
            c.AssignedWorker,
            c.OpenedUtc,
            c.NextReviewDate,
            new BeneficiaryDto(
                $"{b.FirstName} {b.LastName}",
                b.DateOfBirth,
                PiiMask.MaskLast4(b.MedicaidIdLast4),
                b.MedicaidIdLast4,
                b.County,
                b.PreferredLanguage,
                b.NeedsInterpreter,
                b.CommunicationPreference),
            c.Authorizations.OrderBy(a => a.Id).Select(ToDto).ToList(),
            c.CarePlanGoals.OrderBy(g => g.TargetDate)
                .Select(g => new CarePlanGoalDto(g.Id, g.Description, g.TargetDate, g.Met))
                .ToList());
    }

    public async Task<DecisionOutcome> DecideAuthorizationAsync(
        int caseId, int authorizationId, AuthorizationDecisionRequest request, CancellationToken ct)
    {
        var auth = await _db.ServiceAuthorizations
            .SingleOrDefaultAsync(a => a.Id == authorizationId && a.CaseRecordId == caseId, ct);

        if (auth is null)
        {
            return new DecisionOutcome(DecisionResultKind.NotFound);
        }

        if (auth.Status != AuthorizationStatus.Pending)
        {
            return new DecisionOutcome(DecisionResultKind.AlreadyDecided, ToDto(auth));
        }

        auth.Status = request.Decision!.Value;
        auth.DecisionReason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        auth.DecidedBy = _user.UserName;
        auth.DecidedUtc = _clock.GetUtcNow().UtcDateTime;

        // Never write PII into audit details; reference records by ID only.
        _audit.Record(
            action: $"Authorization{auth.Status}",
            entityType: nameof(ServiceAuthorization),
            entityId: auth.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
            details: $"Case {caseId}; service {auth.ServiceCode}");

        await _db.SaveChangesAsync(ct);
        return new DecisionOutcome(DecisionResultKind.Success, ToDto(auth));
    }

    private static ServiceAuthorizationDto ToDto(ServiceAuthorization a) => new(
        a.Id, a.ServiceCode, a.ServiceName, a.UnitsPerWeek, a.StartDate, a.EndDate,
        a.Status, a.DecisionReason, a.DecidedBy, a.DecidedUtc);
}

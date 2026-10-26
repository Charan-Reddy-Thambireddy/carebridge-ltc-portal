using CareBridge.Api.Data;
using CareBridge.Api.Domain;
using CareBridge.Api.Middleware;

namespace CareBridge.Api.Services;

/// <summary>
/// Identity of the signed-in staff member. In production this is resolved from
/// Azure AD / Entra ID claims (OIDC); the demo uses a fixed fictional caseworker.
/// </summary>
public interface ICurrentUser
{
    string UserName { get; }
}

public sealed class DemoCurrentUser : ICurrentUser
{
    public string UserName => "demo.caseworker";
}

public interface IAuditLogger
{
    void Record(string action, string entityType, string entityId, string? details = null);
}

/// <summary>
/// Adds audit rows to the current unit of work so the audit entry and the business
/// change are committed in the same transaction (both succeed or neither does).
/// </summary>
public sealed class AuditLogger : IAuditLogger
{
    private readonly CareBridgeDbContext _db;
    private readonly ICurrentUser _user;
    private readonly IHttpContextAccessor _http;
    private readonly TimeProvider _clock;

    public AuditLogger(CareBridgeDbContext db, ICurrentUser user, IHttpContextAccessor http, TimeProvider clock)
    {
        _db = db;
        _user = user;
        _http = http;
        _clock = clock;
    }

    public void Record(string action, string entityType, string entityId, string? details = null)
    {
        _db.AuditEntries.Add(new AuditEntry
        {
            TimestampUtc = _clock.GetUtcNow().UtcDateTime,
            Actor = _user.UserName,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Details = details,
            CorrelationId = _http.HttpContext?.Items[CorrelationIdMiddleware.ItemKey] as string ?? string.Empty
        });
    }
}

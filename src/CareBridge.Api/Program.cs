using System.Text.Json.Serialization;
using CareBridge.Api.Data;
using CareBridge.Api.Middleware;
using CareBridge.Api.Security;
using CareBridge.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ---- Data -----------------------------------------------------------------
// SQL Server when a connection string is configured (see database/ for schema scripts);
// otherwise an in-memory database seeded with fictional data so the demo runs with zero setup.
var connectionString = builder.Configuration.GetConnectionString("CareBridge");
builder.Services.AddDbContext<CareBridgeDbContext>(options =>
{
    if (!string.IsNullOrWhiteSpace(connectionString))
    {
        options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure());
    }
    else
    {
        options.UseInMemoryDatabase(builder.Configuration["InMemoryDatabaseName"] ?? "CareBridge");
    }
});

// ---- Application services -------------------------------------------------
builder.Services.AddDataProtection();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IPiiProtector, PiiProtector>();
builder.Services.Configure<EligibilityRulesOptions>(builder.Configuration.GetSection(EligibilityRulesOptions.SectionName));
builder.Services.AddSingleton<IEligibilityService, EligibilityService>();
builder.Services.AddScoped<ICurrentUser, DemoCurrentUser>();
builder.Services.AddScoped<IAuditLogger, AuditLogger>();
builder.Services.AddScoped<ICaseService, CaseService>();

// ---- Web / API ------------------------------------------------------------
builder.Services
    .AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// RFC 7807 problem details for every error response, including unhandled exceptions.
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        if (ctx.HttpContext.Items[CorrelationIdMiddleware.ItemKey] is string correlationId)
        {
            ctx.ProblemDetails.Extensions["correlationId"] = correlationId;
        }
    };
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks();

var app = builder.Build();

// ---- Pipeline -------------------------------------------------------------
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();
app.MapHealthChecks("/health");

// Seed fictional demo data when running on the in-memory provider.
if (string.IsNullOrWhiteSpace(connectionString))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CareBridgeDbContext>();
    db.Database.EnsureCreated();
    DataSeeder.Seed(db, scope.ServiceProvider.GetRequiredService<IPiiProtector>());
}

app.Run();

/// <summary>Exposed for WebApplicationFactory integration tests.</summary>
public partial class Program
{
}

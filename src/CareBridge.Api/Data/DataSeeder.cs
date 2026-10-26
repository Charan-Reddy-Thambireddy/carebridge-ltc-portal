using CareBridge.Api.Domain;
using CareBridge.Api.Security;

namespace CareBridge.Api.Data;

/// <summary>
/// Seeds deterministic, entirely fictional demo data. No real people, IDs,
/// counties' case data, or agency records are used anywhere in this project.
/// </summary>
public static class DataSeeder
{
    private static readonly string[] FirstNames =
    {
        "Avery", "Jordan", "Morgan", "Riley", "Casey", "Quinn", "Rowan", "Emerson",
        "Harper", "Skyler", "Dakota", "Reese", "Finley", "Sage", "Parker", "Logan",
        "Elliot", "Hayden", "Jamie", "Kendall", "Marlow", "Noel", "Peyton", "Tatum"
    };

    private static readonly string[] LastNames =
    {
        "Alvarez", "Brooks", "Chen", "Delgado", "Ellison", "Fischer", "Garcia", "Haddad",
        "Iverson", "Jensen", "Kowalski", "Lindqvist", "Moreno", "Nakamura", "Okafor", "Petrov",
        "Quintero", "Ramirez", "Sorensen", "Tran", "Umarov", "Vasquez", "Whitfield", "Yilmaz"
    };

    // Fictional county names to avoid implying any real agency's data.
    private static readonly string[] Counties = { "Prairie", "Riverbend", "Oak Hollow", "Cedar Ridge", "Lakeshore" };
    private static readonly string[] Languages = { "English", "Spanish", "Vietnamese", "Arabic", "Bosnian", "English" };
    private static readonly string[] Workers = { "A. Rivera", "B. Thompson", "C. Osei", "D. Laurent" };

    private static readonly (string Code, string Name)[] Services =
    {
        ("PCA", "Personal care assistance"),
        ("HDM", "Home-delivered meals"),
        ("ADH", "Adult day health"),
        ("RES", "Respite care"),
        ("PERS", "Personal emergency response system"),
        ("SNF", "Skilled nursing facility stay")
    };

    public static void Seed(CareBridgeDbContext db, IPiiProtector pii)
    {
        if (db.Cases.Any())
        {
            return;
        }

        var baseDate = new DateTime(2026, 3, 2, 14, 0, 0, DateTimeKind.Utc);
        var programs = Enum.GetValues<ProgramType>();
        var statuses = Enum.GetValues<CaseStatus>();
        var priorities = Enum.GetValues<CasePriority>();
        var preferences = Enum.GetValues<CommunicationPreference>();

        for (var i = 0; i < 24; i++)
        {
            // Fictional ID format: "XX" + 8 digits. Not a real Medicaid ID pattern for any state.
            var medicaidId = $"XX{(10_000_000 + (i * 7_919_311) % 89_999_999):D8}";

            var beneficiary = new Beneficiary
            {
                FirstName = FirstNames[i],
                LastName = LastNames[(i * 5) % LastNames.Length],
                DateOfBirth = new DateOnly(1938 + (i * 3) % 30, 1 + i % 12, 1 + (i * 7) % 28),
                MedicaidIdProtected = pii.Protect(medicaidId),
                MedicaidIdLast4 = PiiMask.Last4(medicaidId),
                County = Counties[i % Counties.Length],
                PreferredLanguage = Languages[i % Languages.Length],
                NeedsInterpreter = Languages[i % Languages.Length] != "English",
                CommunicationPreference = preferences[i % preferences.Length]
            };

            var opened = baseDate.AddDays(-(i * 6)).AddHours(i);
            var caseRecord = new CaseRecord
            {
                CaseNumber = $"LTC-{2026}-{1001 + i:D5}",
                Beneficiary = beneficiary,
                Program = programs[i % programs.Length],
                Status = statuses[(i * 7) % statuses.Length],
                Priority = priorities[(i * 11) % priorities.Length],
                AssignedWorker = Workers[i % Workers.Length],
                OpenedUtc = opened,
                NextReviewDate = DateOnly.FromDateTime(opened.AddMonths(6))
            };

            var serviceCount = 1 + i % 3;
            for (var s = 0; s < serviceCount; s++)
            {
                var svc = Services[(i + s) % Services.Length];
                var start = DateOnly.FromDateTime(opened.AddDays(14));
                caseRecord.Authorizations.Add(new ServiceAuthorization
                {
                    ServiceCode = svc.Code,
                    ServiceName = svc.Name,
                    UnitsPerWeek = 4 + ((i + s) * 3) % 17,
                    StartDate = start,
                    EndDate = start.AddMonths(6),
                    Status = s == 0 ? AuthorizationStatus.Pending : AuthorizationStatus.Approved,
                    DecidedBy = s == 0 ? null : Workers[(i + 1) % Workers.Length],
                    DecidedUtc = s == 0 ? null : opened.AddDays(10)
                });
            }

            caseRecord.CarePlanGoals.Add(new CarePlanGoal
            {
                Description = "Remain safely at home with daily support for bathing and dressing.",
                TargetDate = DateOnly.FromDateTime(opened.AddMonths(3)),
                Met = i % 4 == 0
            });
            caseRecord.CarePlanGoals.Add(new CarePlanGoal
            {
                Description = "Attend scheduled primary-care and medication-review visits.",
                TargetDate = DateOnly.FromDateTime(opened.AddMonths(2)),
                Met = i % 3 == 0
            });

            db.Cases.Add(caseRecord);
        }

        db.SaveChanges();
    }
}

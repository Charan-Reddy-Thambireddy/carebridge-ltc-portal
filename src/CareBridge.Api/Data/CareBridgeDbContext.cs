using CareBridge.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace CareBridge.Api.Data;

public class CareBridgeDbContext : DbContext
{
    public CareBridgeDbContext(DbContextOptions<CareBridgeDbContext> options) : base(options)
    {
    }

    public DbSet<Beneficiary> Beneficiaries => Set<Beneficiary>();
    public DbSet<CaseRecord> Cases => Set<CaseRecord>();
    public DbSet<ServiceAuthorization> ServiceAuthorizations => Set<ServiceAuthorization>();
    public DbSet<CarePlanGoal> CarePlanGoals => Set<CarePlanGoal>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Beneficiary>(b =>
        {
            b.ToTable("Beneficiary");
            b.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
            b.Property(x => x.LastName).HasMaxLength(100).IsRequired();
            b.Property(x => x.MedicaidIdProtected).HasMaxLength(512).IsRequired();
            b.Property(x => x.MedicaidIdLast4).HasMaxLength(4).IsFixedLength().IsRequired();
            b.Property(x => x.County).HasMaxLength(60);
            b.Property(x => x.PreferredLanguage).HasMaxLength(40);
            b.Property(x => x.CommunicationPreference).HasConversion<string>().HasMaxLength(30);
            b.HasIndex(x => new { x.LastName, x.FirstName });
        });

        modelBuilder.Entity<CaseRecord>(c =>
        {
            c.ToTable("CaseRecord");
            c.Property(x => x.CaseNumber).HasMaxLength(20).IsRequired();
            c.HasIndex(x => x.CaseNumber).IsUnique();
            c.Property(x => x.Program).HasConversion<string>().HasMaxLength(40);
            c.Property(x => x.Status).HasConversion<string>().HasMaxLength(30);
            c.Property(x => x.Priority).HasConversion<string>().HasMaxLength(20);
            c.Property(x => x.AssignedWorker).HasMaxLength(120);
            c.HasIndex(x => new { x.Status, x.OpenedUtc });
            c.HasOne(x => x.Beneficiary).WithMany(x => x.Cases).HasForeignKey(x => x.BeneficiaryId);
            c.HasMany(x => x.Authorizations).WithOne(x => x.CaseRecord).HasForeignKey(x => x.CaseRecordId);
            c.HasMany(x => x.CarePlanGoals).WithOne().HasForeignKey(x => x.CaseRecordId);
        });

        modelBuilder.Entity<ServiceAuthorization>(a =>
        {
            a.ToTable("ServiceAuthorization");
            a.Property(x => x.ServiceCode).HasMaxLength(10).IsRequired();
            a.Property(x => x.ServiceName).HasMaxLength(120).IsRequired();
            a.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            a.Property(x => x.DecisionReason).HasMaxLength(500);
            a.Property(x => x.DecidedBy).HasMaxLength(120);
        });

        modelBuilder.Entity<CarePlanGoal>(g =>
        {
            g.ToTable("CarePlanGoal");
            g.Property(x => x.Description).HasMaxLength(300).IsRequired();
        });

        modelBuilder.Entity<AuditEntry>(e =>
        {
            e.ToTable("AuditEntry");
            e.Property(x => x.Actor).HasMaxLength(120).IsRequired();
            e.Property(x => x.Action).HasMaxLength(60).IsRequired();
            e.Property(x => x.EntityType).HasMaxLength(60).IsRequired();
            e.Property(x => x.EntityId).HasMaxLength(40).IsRequired();
            e.Property(x => x.CorrelationId).HasMaxLength(64);
            e.HasIndex(x => new { x.EntityType, x.EntityId });
        });
    }
}

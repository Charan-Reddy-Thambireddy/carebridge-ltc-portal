namespace CareBridge.Api.Domain;

/// <summary>Programs supported by the (fictional) long-term care platform.</summary>
public enum ProgramType
{
    MedicaidLongTermCare,
    HomeAndCommunityBasedServices,
    MedicareSavingsProgram
}

/// <summary>Lifecycle of a beneficiary case.</summary>
public enum CaseStatus
{
    Intake,
    AssessmentScheduled,
    UnderReview,
    Approved,
    Denied,
    Reassessment
}

public enum CasePriority
{
    Routine,
    Expedited,
    Urgent
}

public enum AuthorizationStatus
{
    Pending,
    Approved,
    Denied
}

/// <summary>
/// How the beneficiary asked to receive notices. Tracking this is part of
/// providing effective communication (ADA / Section 504 / Section 1557).
/// </summary>
public enum CommunicationPreference
{
    StandardPrint,
    LargePrint,
    Braille,
    AudioRecording,
    AccessibleElectronic,
    TtyRelay
}

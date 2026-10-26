using Microsoft.AspNetCore.DataProtection;

namespace CareBridge.Api.Security;

/// <summary>
/// Encrypts and masks personally identifiable information (PII) such as Medicaid IDs.
/// Uses the ASP.NET Core Data Protection API (AES-256-CBC + HMACSHA256 by default)
/// rather than hand-rolled cryptography. In production the key ring would be persisted
/// to Azure Key Vault / Blob Storage (or AWS KMS) instead of the default local store.
/// </summary>
public interface IPiiProtector
{
    string Protect(string plaintext);
    string Unprotect(string protectedValue);
}

public sealed class PiiProtector : IPiiProtector
{
    // Purpose strings isolate keys: a payload protected for one purpose cannot be read by another.
    private const string Purpose = "CareBridge.Pii.MedicaidId.v1";
    private readonly IDataProtector _protector;

    public PiiProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector(Purpose);
    }

    public string Protect(string plaintext)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(plaintext);
        return _protector.Protect(plaintext);
    }

    public string Unprotect(string protectedValue)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(protectedValue);
        return _protector.Unprotect(protectedValue);
    }
}

public static class PiiMask
{
    /// <summary>
    /// Returns a masked identifier such as "*****4821". The visible screen-reader
    /// text is produced separately on the client ("ending in 4 8 2 1").
    /// </summary>
    public static string MaskLast4(string? last4)
    {
        if (string.IsNullOrWhiteSpace(last4))
        {
            return "Not on file";
        }

        var visible = last4.Length <= 4 ? last4 : last4[^4..];
        return new string('*', 5) + visible;
    }

    public static string Last4(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        return value.Length <= 4 ? value : value[^4..];
    }
}

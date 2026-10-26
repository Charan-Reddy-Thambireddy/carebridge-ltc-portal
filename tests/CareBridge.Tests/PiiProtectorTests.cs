using CareBridge.Api.Security;
using Microsoft.AspNetCore.DataProtection;

namespace CareBridge.Tests;

public class PiiProtectorTests
{
    private static PiiProtector CreateProtector() => new(new EphemeralDataProtectionProvider());

    [Fact]
    public void Protect_produces_ciphertext_that_round_trips()
    {
        var protector = CreateProtector();

        var cipher = protector.Protect("XX12345678");

        Assert.DoesNotContain("12345678", cipher, StringComparison.Ordinal);
        Assert.Equal("XX12345678", protector.Unprotect(cipher));
    }

    [Fact]
    public void Ciphertext_from_one_key_ring_cannot_be_read_by_another()
    {
        var cipher = CreateProtector().Protect("XX12345678");

        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(
            () => CreateProtector().Unprotect(cipher));
    }

    [Theory]
    [InlineData("4821", "*****4821")]
    [InlineData("XX12344821", "*****4821")]
    [InlineData(null, "Not on file")]
    [InlineData("", "Not on file")]
    public void MaskLast4_never_exposes_more_than_four_characters(string? input, string expected)
    {
        Assert.Equal(expected, PiiMask.MaskLast4(input));
    }
}

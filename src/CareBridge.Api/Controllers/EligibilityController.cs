using CareBridge.Api.Dtos;
using CareBridge.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace CareBridge.Api.Controllers;

[ApiController]
[Route("api/eligibility")]
[Produces("application/json")]
public sealed class EligibilityController : ControllerBase
{
    private readonly IEligibilityService _eligibility;

    public EligibilityController(IEligibilityService eligibility)
    {
        _eligibility = eligibility;
    }

    /// <summary>
    /// Anonymous pre-screening. Returns 400 with ValidationProblemDetails whose keys match
    /// the form field names, so the UI can link each message to its input.
    /// </summary>
    [HttpPost("screen")]
    [ProducesResponseType(typeof(EligibilityScreeningResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public ActionResult<EligibilityScreeningResponse> Screen([FromBody] EligibilityScreeningRequest request)
    {
        return Ok(_eligibility.Screen(request));
    }
}

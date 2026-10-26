using CareBridge.Api.Dtos;
using CareBridge.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace CareBridge.Api.Controllers;

/// <summary>
/// Caseworker endpoints. In production these carry [Authorize(Policy = "Caseworker")]
/// backed by Entra ID role claims; the demo runs unauthenticated with fictional data.
/// </summary>
[ApiController]
[Route("api/cases")]
[Produces("application/json")]
public sealed class CasesController : ControllerBase
{
    private readonly ICaseService _cases;

    public CasesController(ICaseService cases)
    {
        _cases = cases;
    }

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<CaseSummaryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PagedResult<CaseSummaryDto>>> Search([FromQuery] CaseQuery query, CancellationToken ct)
    {
        return Ok(await _cases.SearchAsync(query, ct));
    }

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(CaseDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CaseDetailDto>> Get(int id, CancellationToken ct)
    {
        var result = await _cases.GetAsync(id, ct);
        if (result is null)
        {
            return Problem(statusCode: StatusCodes.Status404NotFound, title: "Case not found",
                detail: $"No case exists with ID {id}.");
        }

        return Ok(result);
    }

    [HttpPost("{caseId:int}/authorizations/{authorizationId:int}/decision")]
    [ProducesResponseType(typeof(ServiceAuthorizationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ServiceAuthorizationDto>> Decide(
        int caseId, int authorizationId, [FromBody] AuthorizationDecisionRequest request, CancellationToken ct)
    {
        var outcome = await _cases.DecideAuthorizationAsync(caseId, authorizationId, request, ct);

        return outcome.Kind switch
        {
            DecisionResultKind.Success => Ok(outcome.Authorization),
            DecisionResultKind.AlreadyDecided => Problem(statusCode: StatusCodes.Status409Conflict,
                title: "Already decided.",
                detail: "This service authorization was already decided. Refresh the page to see the current status."),
            _ => Problem(statusCode: StatusCodes.Status404NotFound, title: "Authorization not found",
                detail: "The service authorization could not be found for this case.")
        };
    }
}

/**
 * Small fetch wrapper for the CareBridge REST API.
 * Always resolves (never throws) so callers can render an accessible error state.
 *
 * @typedef {{ ok: boolean, status: number, data: any, problem: any }} ApiResult
 */

async function request(method, url, body) {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const type = response.headers.get("Content-Type") || "";
    const payload = type.includes("json") ? await response.json() : null;

    return response.ok
      ? { ok: true, status: response.status, data: payload, problem: null }
      : { ok: false, status: response.status, data: null, problem: payload };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      problem: { title: "Connection problem", detail: "We could not reach the server. Check your connection and try again." }
    };
  }
}

/** @returns {Promise<ApiResult>} */
export const apiGet = (url) => request("GET", url);

/** @returns {Promise<ApiResult>} */
export const apiPost = (url, body) => request("POST", url, body);

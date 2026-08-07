const libHTTPProxy = require('http-proxy');
const libHTTP = require('http');

/**
 * Thin wrapper around the `http-proxy` library that centralises error
 * handling, forwarded-header injection, and WebSocket dispatch. One
 * instance per Orator-SSL-Proxy — shared across all routes — since
 * `http-proxy` handles concurrency and the per-call options override
 * the single shared target.
 */
class SSLProxyBackendDispatcher
{
	/**
	 * @param {object} pFable - parent fable for logging
	 */
	constructor(pFable)
	{
		this.fable = pFable;
		this.log = pFable ? pFable.log : null;

		// Pool backend connections with HTTP keep-alive. Without an explicit agent, http-proxy uses
		// Node's default agent (keepAlive off), so every proxied request opened a brand-new TCP
		// connection to the backend -- and a non-keep-alive request makes an HTTP/1.1 backend (e.g.
		// restify) answer `Connection: close`, which http-proxy relays verbatim to the browser. The
		// net effect was NO client-side keep-alive: the browser paid a fresh TCP + TLS handshake for
		// every asset on the page. A keep-alive agent reuses backend sockets AND lets the backend hold
		// the connection open, so keep-alive can be offered to the client. Backends behind this
		// TLS-terminating proxy are plain HTTP, so an http.Agent is the correct pool.
		this.backendAgent = new libHTTP.Agent(
			{
				keepAlive: true,
				keepAliveMsecs: 30000,
				maxSockets: 256,
				maxFreeSockets: 64,
				timeout: 60000
			});
		this.httpProxyServer = libHTTPProxy.createProxyServer({ agent: this.backendAgent });

		// One error handler for all forwarded traffic.
		this.httpProxyServer.on('error', this.handleProxyError.bind(this));

		// Force client-facing keep-alive on HTTP/1.1. http-proxy relays the backend's Connection header
		// verbatim, so a backend that still answers `Connection: close` would defeat the agent above and
		// close the browser's socket anyway. Normalising it here keeps the browser on one warm TLS
		// connection for the whole page. Safe: every proxied response is framed by Content-Length or
		// Transfer-Encoding: chunked (both self-terminating), so the client never relies on the socket
		// closing to know the body ended. WebSocket/upgrade (101) responses are left untouched.
		this.httpProxyServer.on('proxyRes', (pProxyRes, pRequest) =>
			{
				let tmpConnection = (pProxyRes.headers && pProxyRes.headers['connection']) || '';
				if (pRequest && pRequest.httpVersion !== '2.0' && pProxyRes.statusCode !== 101 && !/upgrade/i.test(tmpConnection))
				{
					pProxyRes.headers['connection'] = 'keep-alive';
				}
			});
	}

	handleProxyError(pError, pRequest, pResponseOrSocket)
	{
		if (this.log)
		{
			this.log.warn(`proxy error for ${pRequest && pRequest.url}: ${pError && pError.message}`,
				{ Error: pError && pError.message });
		}

		// Web response
		if (pResponseOrSocket && typeof (pResponseOrSocket.writeHead) === 'function' && !pResponseOrSocket.headersSent)
		{
			try
			{
				pResponseOrSocket.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
				pResponseOrSocket.end(`Bad Gateway: ${pError && pError.message}`);
			}
			catch (pWriteError)
			{
				// Response may already be closed; nothing else to do.
			}
			return;
		}

		// WebSocket upgrade: the second arg is a net.Socket, which has .destroy()
		if (pResponseOrSocket && typeof (pResponseOrSocket.destroy) === 'function')
		{
			try
			{
				pResponseOrSocket.destroy();
			}
			catch (pDestroyError)
			{
				// Socket may already be closed.
			}
		}
	}

	/**
	 * Build the per-call options object for `http-proxy.web()`/`.ws()`.
	 */
	buildProxyOptions(pRouteEntry)
	{
		let tmpOptions =
		{
			target: pRouteEntry.target,
			secure: false,
			changeOrigin: true,
			xfwd: (pRouteEntry.xfwd !== false)
		};
		if (pRouteEntry.httpProxyOptions && typeof (pRouteEntry.httpProxyOptions) === 'object')
		{
			Object.assign(tmpOptions, pRouteEntry.httpProxyOptions);
		}
		return tmpOptions;
	}

	/**
	 * Forward a normal HTTP(S) request to the backend identified by the route
	 * entry. Errors are caught by the shared error handler.
	 */
	dispatchWeb(pRequest, pResponse, pRouteEntry)
	{
		let tmpOptions = this.buildProxyOptions(pRouteEntry);
		try
		{
			this.httpProxyServer.web(pRequest, pResponse, tmpOptions);
		}
		catch (pError)
		{
			this.handleProxyError(pError, pRequest, pResponse);
		}
	}

	/**
	 * Forward a WebSocket upgrade to the backend.
	 */
	dispatchWs(pRequest, pSocket, pHead, pRouteEntry)
	{
		let tmpOptions = this.buildProxyOptions(pRouteEntry);
		tmpOptions.ws = true;
		try
		{
			this.httpProxyServer.ws(pRequest, pSocket, pHead, tmpOptions);
		}
		catch (pError)
		{
			this.handleProxyError(pError, pRequest, pSocket);
		}
	}

	/**
	 * Release the underlying proxy server. Safe to call multiple times.
	 */
	close()
	{
		if (this.httpProxyServer && typeof (this.httpProxyServer.close) === 'function')
		{
			try
			{
				this.httpProxyServer.close();
			}
			catch (pError)
			{
				// Nothing to do — we're tearing down.
			}
		}
		if (this.backendAgent && typeof (this.backendAgent.destroy) === 'function')
		{
			try
			{
				this.backendAgent.destroy();
			}
			catch (pError)
			{
				// Nothing to do — we're tearing down.
			}
		}
	}
}

module.exports = SSLProxyBackendDispatcher;

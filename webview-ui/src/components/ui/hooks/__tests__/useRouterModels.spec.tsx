import { providerIdentifiers } from "@roo-code/types"
import React from "react"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fetchRouterModels, useRouterModels } from "../useRouterModels"
import { vscode } from "@/utils/vscode"

vi.mock("@/utils/vscode", () => ({ vscode: { postMessage: vi.fn() } }))

describe("router request cleanup", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
	})
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("rejects an already-aborted signal without starting any work", async () => {
		const add = vi.spyOn(window, "addEventListener")
		const timeout = vi.spyOn(globalThis, "setTimeout")
		const controller = new AbortController()
		const reason = new Error("Model request already cancelled")
		controller.abort(reason)

		await expect(fetchRouterModels(providerIdentifiers.openrouter, controller.signal)).rejects.toBe(reason)

		expect(add).not.toHaveBeenCalled()
		expect(timeout).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(0)
		expect(vscode.postMessage).not.toHaveBeenCalled()
	})

	it("removes its listener and timer and cancels backend work on abort", async () => {
		const add = vi.spyOn(window, "addEventListener")
		const remove = vi.spyOn(window, "removeEventListener")
		const controller = new AbortController()
		const pending = fetchRouterModels(providerIdentifiers.openrouter, controller.signal)
		const rejected = expect(pending).rejects.toBeDefined()
		const request = vi.mocked(vscode.postMessage).mock.calls[0][0]
		const listener = add.mock.calls.find(([type]) => type === "message")![1]
		expect(vi.getTimerCount()).toBe(1)
		controller.abort()
		await rejected
		expect(remove).toHaveBeenCalledWith("message", listener)
		expect(vi.getTimerCount()).toBe(0)
		expect(vscode.postMessage).toHaveBeenLastCalledWith({
			type: "cancelModelRequest",
			requestId: request.requestId,
		})
	})

	it("times out, cancels the matching request, and releases listeners and timers", async () => {
		const add = vi.spyOn(window, "addEventListener")
		const remove = vi.spyOn(window, "removeEventListener")
		const controller = new AbortController()
		const addAbort = vi.spyOn(controller.signal, "addEventListener")
		const removeAbort = vi.spyOn(controller.signal, "removeEventListener")
		const pending = fetchRouterModels(providerIdentifiers.openrouter, controller.signal)
		const rejected = expect(pending).rejects.toThrow("Router models request timed out")
		const request = vi.mocked(vscode.postMessage).mock.calls[0][0]
		const listener = add.mock.calls.find(([type]) => type === "message")![1]
		await vi.advanceTimersByTimeAsync(10_000)
		await rejected
		expect(remove).toHaveBeenCalledWith("message", listener)
		expect(removeAbort).toHaveBeenCalledWith("abort", addAbort.mock.calls[0][1])
		expect(vi.getTimerCount()).toBe(0)
		expect(vscode.postMessage).toHaveBeenLastCalledWith({
			type: "cancelModelRequest",
			requestId: request.requestId,
		})
		controller.abort()
		expect(vscode.postMessage).toHaveBeenCalledTimes(2)
	})

	it("aborts a pending query when its last observer unmounts", () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
		const remove = vi.spyOn(window, "removeEventListener")
		const { unmount } = renderHook(() => useRouterModels({ provider: providerIdentifiers.openrouter }), {
			wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
		})
		const request = vi.mocked(vscode.postMessage).mock.calls[0][0]
		unmount()
		expect(vscode.postMessage).toHaveBeenLastCalledWith({
			type: "cancelModelRequest",
			requestId: request.requestId,
		})
		expect(remove).toHaveBeenCalledWith("message", expect.any(Function))
		expect(vi.getTimerCount()).toBe(0)
		client.clear()
	})

	it("cleans up after a matching response and ignores another request's response", async () => {
		const controller = new AbortController()
		const pending = fetchRouterModels(providerIdentifiers.openrouter, controller.signal)
		const request = vi.mocked(vscode.postMessage).mock.calls[0][0]
		const response = {
			type: "routerModels",
			values: { provider: providerIdentifiers.openrouter },
			routerModels: { openrouter: {} },
		}
		window.dispatchEvent(new MessageEvent("message", { data: { ...response, requestId: "stale" } }))
		expect(vi.getTimerCount()).toBe(1)
		window.dispatchEvent(new MessageEvent("message", { data: { ...response, requestId: request.requestId } }))
		expect(await pending).toEqual(response.routerModels)
		expect(vi.getTimerCount()).toBe(0)
		controller.abort()
		expect(vscode.postMessage).toHaveBeenCalledTimes(1)
	})
})

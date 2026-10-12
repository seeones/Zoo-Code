import { ModelRequestRegistry } from "../ModelRequestRegistry"

it("clears cancelled requests before settlement and preserves fresh requests after late completion", async () => {
	const registry = new ModelRequestRegistry()
	let finish!: () => void
	let firstSignal!: AbortSignal
	const first = registry.run("same-id", (signal) => {
		firstSignal = signal
		return new Promise<void>((resolve) => {
			finish = resolve
		})
	})
	registry.cancelAll()
	expect(firstSignal.aborted).toBe(true)
	expect(registry["requests"].size).toBe(0)
	let freshSignal!: AbortSignal
	const fresh = registry.run("same-id", (signal) => {
		freshSignal = signal
		return new Promise<void>((resolve) => {
			signal.addEventListener("abort", () => resolve(), { once: true })
		})
	})
	finish()
	await first
	expect(freshSignal.aborted).toBe(false)
	expect(registry["requests"].size).toBe(1)
	registry.cancelAll()
	expect(freshSignal.aborted).toBe(true)
	await fresh
})

it("aborts all pending requests on disposal and does not start new work", async () => {
	const registry = new ModelRequestRegistry()
	const signals: AbortSignal[] = []
	const fetch = vi.fn(
		(signal: AbortSignal) =>
			new Promise<void>((resolve) => {
				signals.push(signal)
				signal.addEventListener("abort", () => resolve(), { once: true })
			}),
	)
	const first = registry.run("first", fetch)
	const second = registry.run("second", fetch)
	registry.dispose()
	await Promise.all([first, second, registry.run("third", fetch)])
	expect(signals.every((signal) => signal.aborted)).toBe(true)
	expect(fetch).toHaveBeenCalledTimes(2)
})

it("aborts a replaced request and keeps its replacement registered after late completion", async () => {
	const registry = new ModelRequestRegistry()
	let finishFirst!: () => void
	let firstSignal!: AbortSignal
	let secondSignal!: AbortSignal
	const first = registry.run("same-id", (signal) => {
		firstSignal = signal
		return new Promise<void>((resolve) => {
			finishFirst = resolve
		})
	})
	const second = registry.run("same-id", (signal) => {
		expect(firstSignal.aborted).toBe(true)
		secondSignal = signal
		return new Promise<void>((resolve) => {
			signal.addEventListener("abort", () => resolve(), { once: true })
		})
	})
	finishFirst()
	await first
	expect(secondSignal.aborted).toBe(false)
	registry.cancel("same-id")
	expect(secondSignal.aborted).toBe(true)
	await second
})

it("swallows abort-triggered rejections on replacement and explicit cancellation", async () => {
	const registry = new ModelRequestRegistry()
	const signals: AbortSignal[] = []
	const fetch = (signal: AbortSignal) =>
		new Promise<void>((_resolve, reject) => {
			signals.push(signal)
			signal.addEventListener("abort", () => reject(signal.reason), { once: true })
		})
	const first = registry.run("same-id", fetch)
	const firstResolved = expect(first).resolves.toBeUndefined()
	const second = registry.run("same-id", fetch)
	const secondResolved = expect(second).resolves.toBeUndefined()

	await firstResolved
	expect(signals[0].aborted).toBe(true)
	expect(signals[1].aborted).toBe(false)
	registry.cancel("same-id")
	expect(signals[1].aborted).toBe(true)
	await secondResolved
})

it("propagates errors from requests that were not aborted", async () => {
	const registry = new ModelRequestRegistry()
	const failure = new Error("model discovery failed")
	await expect(
		registry.run("failed", async () => {
			throw failure
		}),
	).rejects.toBe(failure)
})

import type * as vscode from "vscode"
import { CodeIndexManagerRegistry } from "./code-index-manager-registry"
import { CodeIndexStatusManager } from "./code-index-status-manager"

export class CodeIndexScope implements vscode.Disposable {
	private statusManager?: CodeIndexStatusManager
	private _isInitialized = false

	public constructor(private readonly context: vscode.ExtensionContext) {}

	public init(): void {
		if (this._isInitialized) {
			throw new Error("Code index scope is already initialized")
		}
		const manager = new CodeIndexStatusManager((workspacePath) =>
			CodeIndexManagerRegistry.getOrCreate(this.context, workspacePath),
		)
		this.statusManager = manager
		try {
			manager.init()
			this._isInitialized = true
		} catch (error) {
			this.dispose()
			throw error
		}
	}

	public dispose(): void {
		const manager = this.statusManager
		this.statusManager = undefined
		this._isInitialized = false
		manager?.dispose()
	}
}

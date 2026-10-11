import { providerIdentifiers, type ProviderSettings, type OrganizationAllowList } from "@roo-code/types"

export class ProfileValidator {
	public static isProfileAllowed(profile: ProviderSettings, allowList: OrganizationAllowList): boolean {
		if (allowList.allowAll) {
			return true
		}

		if (!profile.apiProvider) {
			return false
		}

		if (!this.isProviderAllowed(profile.apiProvider, allowList)) {
			return false
		}

		const modelId = this.getModelIdFromProfile(profile)

		if (!modelId) {
			return allowList.providers[profile.apiProvider]?.allowAll === true
		}

		return this.isModelAllowed(profile.apiProvider, modelId, allowList)
	}

	private static isProviderAllowed(providerName: string, allowList: OrganizationAllowList): boolean {
		if (allowList.allowAll) {
			return true
		}

		return providerName in allowList.providers
	}

	private static isModelAllowed(providerName: string, modelId: string, allowList: OrganizationAllowList): boolean {
		if (allowList.allowAll) {
			return true
		}

		const providerAllowList = allowList.providers[providerName]

		if (!providerAllowList) {
			return false
		}

		if (providerAllowList.allowAll) {
			return true
		}

		return providerAllowList.models?.includes(modelId) ?? false
	}

	private static getModelIdFromProfile(profile: ProviderSettings): string | undefined {
		switch (profile.apiProvider) {
			case providerIdentifiers.openai:
				return profile.openAiModelId
			case providerIdentifiers.anthropic:
			case providerIdentifiers.openaiNative:
			case providerIdentifiers.bedrock:
			case providerIdentifiers.vertex:
			case providerIdentifiers.gemini:
			case providerIdentifiers.mistral:
			case providerIdentifiers.deepseek:
			case providerIdentifiers.xai:
			case providerIdentifiers.sambanova:
			case providerIdentifiers.fireworks:
			case providerIdentifiers.friendli:
				return profile.apiModelId
			case providerIdentifiers.litellm:
				return profile.litellmModelId
			case providerIdentifiers.lmstudio:
				return profile.lmStudioModelId
			case providerIdentifiers.vscodeLm: {
				// The webview's model selector validates and stores the compound `vendor/family`
				// identity when no explicit `id` is set, so the validator must extract the same
				// value; otherwise a restrictive allowlist entry keyed on `vendor/family` would
				// never match the stored selection.
				const selector = profile.vsCodeLmModelSelector
				return (
					selector?.id ??
					(selector?.vendor && selector?.family ? `${selector.vendor}/${selector.family}` : undefined)
				)
			}
			case providerIdentifiers.openrouter:
				return profile.openRouterModelId
			case providerIdentifiers.ollama:
				return profile.ollamaModelId
			case providerIdentifiers.requesty:
				return profile.requestyModelId
			case providerIdentifiers.unbound:
				return profile.unboundModelId
			case providerIdentifiers.fakeAi:
			default:
				return undefined
		}
	}
}

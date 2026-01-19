package ai

// IsReasoningModelForTest exposes isReasoningModel for tests.
func IsReasoningModelForTest(p *OpenAIProvider) bool {
	return p.isReasoningModel()
}

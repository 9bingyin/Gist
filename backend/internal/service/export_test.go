package service

// Export for testing
var IsValidURL = isValidURL
var HasDynamicTime = hasDynamicTime
var ExtractDateFromSummary = extractDateFromSummary
var ExtractPublishedAt = extractPublishedAt
var ExtractThumbnail = extractThumbnail
var OptionalString = optionalString
var WalkTree = walkTree
var BuildReferer = buildReferer
var IsValidHost = isValidHost
var DefaultAppearanceContentTypes = defaultAppearanceContentTypes
var MaskAPIKey = maskAPIKey
var IsMaskedKey = isMaskedKey

const (
	KeyAISummaryLanguage = keyAISummaryLanguage
	KeyUserUsername      = keyUserUsername
	KeyUserNickname      = keyUserNickname
	KeyUserEmail         = keyUserEmail
	KeyUserPasswordHash  = keyUserPasswordHash
	KeyUserJWTSecret     = keyUserJWTSecret
	KeyAIProvider        = keyAIProvider
	KeyAIAPIKey          = keyAIAPIKey
	KeyAIBaseURL         = keyAIBaseURL
	KeyAIModel           = keyAIModel
	KeyAIThinking        = keyAIThinking
	KeyAIThinkingBudget  = keyAIThinkingBudget
	KeyAIReasoningEffort = keyAIReasoningEffort
	KeyAIAutoTranslate   = keyAIAutoTranslate
	KeyAIAutoSummary     = keyAIAutoSummary
	KeyAIRateLimit       = keyAIRateLimit
	KeyNetworkEnabled    = keyNetworkEnabled
	KeyNetworkType       = keyNetworkType
	KeyNetworkHost       = keyNetworkHost
	KeyNetworkPort       = keyNetworkPort
	KeyNetworkUsername   = keyNetworkUsername
	KeyNetworkPassword   = keyNetworkPassword
	KeyNetworkIPStack    = keyNetworkIPStack
)

var (
	ErrUsernameRequiredHelper        = ErrUsernameRequired
	ErrInvalidUsernameHelper         = ErrInvalidUsername
	ErrEmailRequiredHelper           = ErrEmailRequired
	ErrPasswordRequiredHelper        = ErrPasswordRequired
	ErrPasswordTooShortHelper        = ErrPasswordTooShort
	ErrUserExistsHelper              = ErrUserExists
	ErrUserNotFoundHelper            = ErrUserNotFound
	ErrInvalidPasswordHelper         = ErrInvalidPassword
	ErrCurrentPasswordRequiredHelper = ErrCurrentPasswordRequired
	ErrSamePasswordHelper            = ErrSamePassword
	ErrInvalidTokenHelper            = ErrInvalidToken
)

// Refresh service helpers for tests.
func SetRefreshServiceRefreshing(s RefreshService, v bool) {
	if rs, ok := s.(*refreshService); ok {
		rs.isRefreshing = v
	}
}

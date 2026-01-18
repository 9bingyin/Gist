package service

// Export for testing
var IsValidURL = isValidURL
var HasDynamicTime = hasDynamicTime
var ExtractDateFromSummary = extractDateFromSummary
var ExtractPublishedAt = extractPublishedAt
var ExtractThumbnail = extractThumbnail
var OptionalString = optionalString
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

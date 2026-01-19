package handler

// Export for testing
type SummarizeResponse = summarizeResponse
type TranslateResponse = translateResponse
type ClearCacheResponse = clearCacheResponse
type UpdateProfileResponse = updateProfileResponse
type UserResponse = userResponse
type DomainRateLimitResponse = domainRateLimitResponse
type DomainRateLimitListResponse = domainRateLimitListResponse
type EntryResponse = entryResponse
type ReadableContentResponse = readableContentResponse
type EntryListResponse = entryListResponse
type StarredCountResponse = starredCountResponse
type EntryClearResponse = entryClearResponse
type UnreadCountsResponse = unreadCountsResponse
type FeedConflictResponse = feedConflictResponse
type FeedResponse = feedResponse
type FeedPreviewResponse = feedPreviewResponse
type FolderResponse = folderResponse
type ImportStartedResponse = importStartedResponse
type ImportCancelledResponse = importCancelledResponse
type AuthStatusResponse = authStatusResponse
type AuthResponseDTO = authResponse
type AISettingsResponse = aiSettingsResponse
type NetworkTestResponse = networkTestResponse
type GeneralSettingsResponse = generalSettingsResponse
type AppearanceSettingsResponse = appearanceSettingsResponse
type AITestResponse = aiTestResponse

var NewFeedHandlerHelper = NewFeedHandler
var NewEntryHandlerHelper = NewEntryHandler
var NewFolderHandlerHelper = NewFolderHandler
var NewAuthHandlerHelper = NewAuthHandler
var NewSettingsHandlerHelper = NewSettingsHandler
var NewAIHandlerHelper = NewAIHandler
var NewDomainRateLimitHandlerHelper = NewDomainRateLimitHandler
var NewOPMLHandlerHelper = NewOPMLHandler
var NewIconHandlerHelper = NewIconHandler
var NewProxyHandlerHelper = NewProxyHandler

var WriteServiceError = writeServiceError
var IDPtrToString = idPtrToString
var Itoa = itoa

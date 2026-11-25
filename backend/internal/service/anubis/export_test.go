package anubis

// Export for testing.
var ParseChallenge = parseChallenge
var SolveChallenge = solveChallenge
var SolvePreact = solvePreact
var SolveMetaRefresh = solveMetaRefresh
var SolveProofOfWork = solveProofOfWork
var TruncateForLog = truncateForLog
var ParseAuthCookieExpiry = parseAuthCookieExpiry

type AzureSession = azureSession
type NewSessionFunc = newSessionFunc

func SetNewSessionForTest(s *Solver, fn NewSessionFunc) {
	s.newSession = fn
}

.PHONY: test gen lint build cover clean

test:
	go test ./... -race -v

gen:
	go generate ./...

lint:
	golangci-lint run

build:
	go build -o gist-server ./cmd/server

cover:
	go test ./... -coverprofile=coverage.out
	go tool cover -html=coverage.out

clean:
	rm -f gist-server coverage.out
	find . -name "mock_*.go" -type f -delete

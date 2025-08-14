# Build stage
FROM golang:1.20-alpine AS builder

RUN apk add --no-cache git gcc musl-dev

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the chaincode server
RUN go build -o chaincode-server server.go consensus.go

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/chaincode-server .

# Expose chaincode port
EXPOSE 9999

# Run the chaincode server
CMD ["./chaincode-server"]
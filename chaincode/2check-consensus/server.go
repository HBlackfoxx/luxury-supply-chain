package main

import (
	"log"
	"os"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	// Check if running as external service
	if os.Getenv("CHAINCODE_SERVER_ADDRESS") != "" {
		RunAsService()
	} else {
		// Run as regular chaincode
		cc, err := contractapi.NewChaincode(&ConsensusContract{})
		if err != nil {
			log.Fatalf("Error creating consensus chaincode: %v", err)
		}
		if err := cc.Start(); err != nil {
			log.Fatalf("Error starting consensus chaincode: %v", err)
		}
	}
}

// RunAsService runs the chaincode as an external service
func RunAsService() {
	cc, err := contractapi.NewChaincode(&ConsensusContract{})
	if err != nil {
		log.Fatalf("Error creating consensus chaincode: %v", err)
	}

	server := &shim.ChaincodeServer{
		CCID:    os.Getenv("CHAINCODE_ID"),
		Address: os.Getenv("CHAINCODE_SERVER_ADDRESS"),
		CC:      cc,
		TLSProps: shim.TLSProperties{
			Disabled: true, // No TLS for simplicity in production
		},
	}

	// Start the chaincode server
	err = server.Start()
	if err != nil {
		log.Fatalf("Error starting consensus chaincode server: %v", err)
	}
}
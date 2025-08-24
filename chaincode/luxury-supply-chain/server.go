package main

import (
	"log"
	"os"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/luxury-supply-chain/chaincode/luxury-supply-chain/contracts"
)

func main() {
	// Check if running as external service
	if os.Getenv("CHAINCODE_SERVER_ADDRESS") != "" {
		RunAsService()
	} else {
		// Run as regular chaincode
		chaincode, err := contractapi.NewChaincode(
			&contracts.SupplyChainContract{},
			&contracts.OwnershipContract{},
			&contracts.RoleManagementContract{},
		)
		if err != nil {
			log.Fatalf("Error creating luxury supply chain chaincode: %v", err)
		}
		if err := chaincode.Start(); err != nil {
			log.Fatalf("Error starting luxury supply chain chaincode: %v", err)
		}
	}
}

// RunAsService runs the chaincode as an external service
func RunAsService() {
	cc, err := contractapi.NewChaincode(
		&contracts.SupplyChainContract{},
		&contracts.OwnershipContract{},
		&contracts.RoleManagementContract{},
	)
	if err != nil {
		log.Fatalf("Error creating supply chain chaincode: %v", err)
	}

	server := &shim.ChaincodeServer{
		CCID:    os.Getenv("CHAINCODE_ID"),
		Address: os.Getenv("CHAINCODE_SERVER_ADDRESS"),
		CC:      cc,
		TLSProps: shim.TLSProperties{
			Disabled: true, // No TLS for simplicity
		},
	}

	// Start the chaincode server
	err = server.Start()
	if err != nil {
		log.Fatalf("Error starting supply chain chaincode server: %v", err)
	}
}
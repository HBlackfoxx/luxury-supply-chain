package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/luxury-supply-chain/chaincode/luxury-supply-chain/contracts"
)

func main() {
	// Create chaincode with both supply chain and ownership contracts
	chaincode, err := contractapi.NewChaincode(
		&contracts.SupplyChainContract{},
		&contracts.OwnershipContract{},
	)
	if err != nil {
		log.Panicf("Error creating luxury supply chain chaincode: %v", err)
	}

	if err := chaincode.Start(); err != nil {
		log.Panicf("Error starting luxury supply chain chaincode: %v", err)
	}
}
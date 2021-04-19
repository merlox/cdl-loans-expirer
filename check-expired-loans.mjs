// A script that checks for expired loans and loans whose collateral has dropped in value. This is a node.js script
import MyWeb3 from 'web3'
import HDWalletProvider from '@truffle/hdwallet-provider'
import fs from 'fs'
import config from './src/config.mjs'

const mnemonic = fs.readFileSync('.secret').toString().trim()
const infuraKey = '76dd7320ebd847b3b07961b61b1a5c00'
let provider = new HDWalletProvider(mnemonic, `https://rinkeby.infura.io/v3/${infuraKey}`)
let web3 = new MyWeb3(provider)
let cdl = {}
let iSwap = {}
let account
const intervalTime = 5 * 60e3 // Every 5 minutes
let counter = 1
let interval

const setup = async () => {
  web3 = new MyWeb3(provider)
  account = (await web3.eth.getAccounts())[0]
  cdl = new web3.eth.Contract(config.cdlAbi, config.cdlAddress)
  iSwap = new web3.eth.Contract(config.iSwap, config.swapRouter)
  console.log('Account:', account)

  startLoop()
}

const getActiveLoans = async () => {
  let loanIds = await cdl.methods.getLoans().call({from: account})
  const closed = await cdl.methods.getClosedLoans().call({from: account})
  loanIds = loanIds.filter(el => {
    return closed.indexOf(el) < 0
  })
  return loanIds
}

const checkIfLoanIsDefaultableByCollateralDrop = async loanId => {
  const check = await cdl.methods.checkIfLoanIsDefaultableByCollateralDrop(loanId).call({from: account})
  return check
}

const loop = async () => {
  console.log('\nLooping...')
  const loanIds = await getActiveLoans()
  console.log(loanIds.length <= 0 ? 'No loans found' : '')

  const path = [
    '0x0C6B70e82075f931F1fF0e8e09Fb44bf5164EfFd', // expected 0.447492
    '0xc778417E063141139Fce010982780140Aa0cD5Ab',
    '0xec0088960204d052A6eEf5F95C5ac976abA9C966', // 500e6 500000000
  ]

  for (let i = 0; i < loanIds.length; i++) {
    const loan = await cdl.methods.getLoan(loanIds[i]).call({from: account})
    const isDefaultableByCollateralDrop = await checkIfLoanIsDefaultableByCollateralDrop(loanIds[i])
    const now = Math.trunc(Date.now() / 1000)
    console.log('Checking loan:', loanIds[i])
    console.log('isDefaultableByCollateralDrop', isDefaultableByCollateralDrop)
    console.log('isDefaultableByExpiration', now > loan.ends)

    // Default by collateral drop
    if (isDefaultableByCollateralDrop) {
      console.log('Success! Defaulting a loan by collateral value drop.')
      try {
        const a = await cdl.methods.defaultLoanByDroppedCollateral(loanIds[i]).send({from: account})
      } catch (e) {console.log('Error', e)}
    }

    // Default by expiration
    if (now > loan.ends) {
      console.log('Success! Defaulting a loan by expiration time.')
      try {
        await cdl.methods.defaultLoanByExpiration(loanIds[i]).send({from: account})
      } catch (e) {console.log('Error', e)}
    }
  }
  counter++
  console.log(`Next loop in 5 minutes`)
}

// Checks all the active loans and executes the required default functions to make a profit
const startLoop = async () => {
  loop()

  interval = setInterval(async () => {
    loop()
  }, intervalTime)
}

setup()
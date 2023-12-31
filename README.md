# stVol:On Chain Short-term Vol market

## Description

Digital option market for crypto trade on 1 day price change


## Documentation

## Oracle Price Feed (Pyth)

### ETH/USD

- Arbitrum: `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` 
- Arbitrum Goerli: `0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6`

## Deployment


### Operation

When a round is started, the round's `lockBlock` and `closeBlock` would be set.

`lockBlock` = current block + `intervalBlocks`

`closeBlock` = current block + (`intervalBlocks` \* 2)

## Kick-start Rounds

The rounds are always kick-started with:

```
genesisOpenRound()
(wait for x blocks)
genesisStartRound()
(wait for x blocks)
executeRound()
```

## Continue Running Rounds

```
executeRound()
(wait for x blocks)
executeRound()
(wait for x blocks)
```

## Resuming Rounds

After errors like missing `executeRound()` etc.

```
pause()
(Users can't participant, but still is able to withdraw)
unpause()
genesisOpenRound()
(wait for x blocks)
genesisStartRound()
(wait for x blocks)
executeRound()
```

## Common Errors

Refer to `test/stVol.test.js`

## Architecture Illustration

### Normal Operation

![normal](images/normal-round.png)

### Missing Round Operation

![missing](images/missing-round.png)

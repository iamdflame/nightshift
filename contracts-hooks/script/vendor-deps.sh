#!/usr/bin/env bash
# lib/ holds only the dependency files this project compiles (its build closure), copied from the pinned upstream
# commits below with their LICENSE files, so `forge build` works from a plain clone with no submodules.
# Run this to replace lib/ with the complete upstream trees at the same commits (e.g. before importing more files).
# The commits match what is deployed on BSC: infinity-core 7c04695 = BSC deployment (3891d0c) + the June 2025
# protocol-fee controller; infinity-periphery 04585d1 = BSC deployment (b22d04b) + a bin-pool helper.
set -euo pipefail
cd "$(dirname "$0")/../lib"

fetch() { # dir repo commit
  rm -rf "$1" && mkdir -p "$1"
  git -C "$1" init -q
  git -C "$1" remote add origin "https://github.com/$2.git"
  git -C "$1" fetch -q --depth 1 origin "$3"
  git -C "$1" checkout -q FETCH_HEAD
  rm -rf "$1/.git"
  echo "lib/$1 <- $2@$3"
}

fetch forge-std              foundry-rs/forge-std                 8e40513d678f392f398620b3ef2b418648b33e89 # v1.11.0
fetch infinity-core          pancakeswap/infinity-core            7c04695faeab8b06570cf6c277d9a9717136fb26
fetch infinity-periphery     pancakeswap/infinity-periphery       04585d106d55d5d3bdf1d79ec5c4275a01caa0a6
fetch openzeppelin-contracts OpenZeppelin/openzeppelin-contracts  659f3063f82422cef820de746444e6f6cba6ca7c # 5.0.2 line, pinned by infinity-core
fetch solmate                transmissions11/solmate              fadb2e2778adbf01c80275bfb99e5c14969d964b # pinned by infinity-core
fetch permit2                pancakeswap/permit2                  cc8b7c0715a5916ee1a1c6c3640d98e06326ead6 # pinned by infinity-periphery

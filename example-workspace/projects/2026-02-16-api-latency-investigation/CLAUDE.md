# API Latency Investigation - Feb 2026

## Goal

Find out why p95 latency on the search API went from 180ms to 410ms after the February 12 deploy.

## Status

- [x] Pulled a week of request traces before and after the deploy
- [x] Ruled out the database: query times are flat
- [ ] Confirm the cause in a load test

## Findings

- The new ranking step calls the embeddings service once per result instead of once per request. With 20 results that is 20 round trips.
- Batching the calls in staging brought p95 back to 190ms.

## Next steps

Load test the batched version, then open a pull request.

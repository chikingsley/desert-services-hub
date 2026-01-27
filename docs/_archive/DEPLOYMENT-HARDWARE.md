# Deployment Hardware Options

This document compares hardware options for self-hosted deployment of Desert Services Hub.

---

## Use Case

- **Internal tool** for 100-500 users
- **Services**: Next.js app + SQLite + MinIO AIStor + (future) Fleet Management
- **Network**: Local/office network (primary bottleneck)
- **Workload**: PDF storage, takeoff measurements, quoting

---

## Hardware Comparison

### NVIDIA DGX Spark

| Spec | Value |
|------|-------|
| **Price** | ~$4,000 |
| **CPU** | GB10 Grace Blackwell (20-core ARM: 10x Cortex-X925 + 10x Cortex-A725) |
| **Memory** | 128GB unified (shared CPU/GPU) |
| **Storage** | 4TB NVMe SSD |
| **GPU** | Blackwell, 1 PFLOP FP4 AI compute |
| **AI Capability** | Run 200B parameter models locally |
| **Networking** | Dual QSFP 200Gb/s aggregate (can link 2 units) |
| **Power** | 240W USB-C |
| **OS** | Ubuntu Linux (DGX OS) |
| **Form Factor** | Compact desktop |
| **Available** | October 2025 |

**Best for**: Future AI features, local LLM inference, overkill for current needs but future-proof.

**Sources**:

- [NVIDIA DGX Spark](https://www.nvidia.com/en-us/products/workstations/dgx-spark/)
- [DGX Spark Hardware Docs](https://docs.nvidia.com/dgx/dgx-spark/hardware.html)
- [Micro Center Listing](https://www.microcenter.com/product/699008/nvidia-dgx-spark)

---

### Mac Studio M3 Ultra (2025)

| Spec | Value |
|------|-------|
| **Price** | $3,999 base / $14,099 maxed |
| **CPU** | M3 Ultra: up to 32-core (24 performance + 8 efficiency) |
| **Memory** | 96GB base, up to 512GB unified |
| **Storage** | 1TB base, up to 16TB SSD |
| **GPU** | Up to 80-core integrated |
| **Neural Engine** | 32-core |
| **Networking** | 10Gb Ethernet, Thunderbolt 5 (120Gb/s) |
| **Power** | ~370W max |
| **OS** | macOS |
| **Form Factor** | 7.7" x 7.7" x 3.7" cube |
| **Weight** | 8.0 lbs |

**Best for**: macOS ecosystem, creative workflows, Docker support via Colima/OrbStack.

**Sources**:

- [Apple Mac Studio Specs](https://www.apple.com/mac-studio/specs/)
- [Apple Newsroom](https://www.apple.com/newsroom/2025/03/apple-unveils-new-mac-studio-the-most-powerful-mac-ever/)

---

### Mac Studio M4 Max (2025)

| Spec | Value |
|------|-------|
| **Price** | $1,999 base |
| **CPU** | M4 Max: 14-core base, up to 16-core |
| **Memory** | 36GB base, up to 128GB unified |
| **Storage** | 512GB base, configurable |
| **GPU** | 32-core base, up to 40-core |
| **Neural Engine** | 16-core |
| **Networking** | 10Gb Ethernet, USB-C (10Gb/s front) |
| **Power** | Lower than Ultra |
| **OS** | macOS |
| **Form Factor** | Same as Ultra |
| **Weight** | 6.1 lbs |

**Best for**: Budget option, still extremely capable, good Docker performance.

**Sources**:

- [Apple Mac Studio](https://www.apple.com/mac-studio/)
- [EveryMac Comparison](https://everymac.com/systems/apple/mac-studio/mac-studio-faq/differences-between-mac-studio-m3-ultra-m4-max-2025.html)

---

## Comparison Table

| Feature | DGX Spark | Mac Studio M3 Ultra | Mac Studio M4 Max |
|---------|-----------|---------------------|-------------------|
| **Price** | $4,000 | $3,999-$14,099 | $1,999+ |
| **CPU Cores** | 20 ARM | Up to 32 Apple | Up to 16 Apple |
| **Memory** | 128GB | 96-512GB | 36-128GB |
| **Storage** | 4TB | 1-16TB | 512GB+ |
| **AI/ML** | Best (1 PFLOP) | Good (Neural Engine) | Good |
| **Docker** | Native Linux | Via Colima/OrbStack | Via Colima/OrbStack |
| **OS** | Ubuntu | macOS | macOS |
| **Network** | 200Gb/s | 10Gb + TB5 | 10Gb |

---

## Recommendation for Desert Services Hub

### Current Needs (100-500 users, internal)

Any of these machines is **massive overkill** in the best way:

1. **Mac Studio M4 Max ($1,999)** - Most cost-effective, handles everything easily
2. **Mac Studio M3 Ultra ($3,999)** - More memory for future growth
3. **DGX Spark ($4,000)** - If you want native Linux + future AI features

### Resource Estimates

| Service | RAM | CPU | Storage |
|---------|-----|-----|---------|
| Next.js App | 512MB-2GB | 1-2 cores | Minimal |
| SQLite | Minimal | Minimal | ~100MB-1GB |
| MinIO AIStor | 1-2GB | 1 core | Scales with PDFs |
| Fleet Management (future) | 1-2GB | 1-2 cores | TBD |
| **Total** | **~4-8GB** | **~4-6 cores** | **Variable** |

With 128GB RAM and 20+ cores, you'd use less than 10% capacity.

---

## Network Considerations

The **network is the bottleneck**, not the hardware:

| Network | Speed | Notes |
|---------|-------|-------|
| Gigabit Ethernet | 1 Gb/s | ~125 MB/s max, fine for most uses |
| 10 Gigabit Ethernet | 10 Gb/s | ~1.25 GB/s, recommended for heavy PDF traffic |
| Wi-Fi 6E | ~2-3 Gb/s | Variable, not recommended for server |
| Thunderbolt 5 | 120 Gb/s | For direct connections only |

### Recommendations

1. Use **wired Gigabit or 10Gb Ethernet** for the server
2. Consider a **10Gb switch** if multiple users upload large PDFs simultaneously
3. For 100-500 users with typical usage, **Gigabit is fine**

---

## Docker on macOS

Since Mac Studio runs macOS, Docker requires a VM layer:

| Tool | Performance | Notes |
|------|-------------|-------|
| **OrbStack** | Excellent | Recommended, fast, low overhead |
| **Colima** | Good | Free, uses Lima |
| **Docker Desktop** | Good | Resource-heavy, licensing issues |

**Recommendation**: Use [OrbStack](https://orbstack.dev/) for best macOS Docker experience.

---

## Summary

For an internal tool with 100-500 users:

- **Budget pick**: Mac Studio M4 Max ($1,999)
- **Future-proof**: DGX Spark ($4,000) - native Linux, AI-ready
- **Maximum flexibility**: Mac Studio M3 Ultra with 512GB RAM

All options handle the workload with headroom to spare. The limiting factor will be network bandwidth, not compute.

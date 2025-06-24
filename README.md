# **Custom HMR Engine**  
*A TypeScript-powered Hot Module Replacement system built from scratch*  
# ⚠ WARNING `bugs` included free of charge!

**Inspired by Vite's sorcery, but dissected for science.**  
*(Watching Vite's HMR feels like Tony Stark debugging Jarvis—so we're building our  own arc reactor.)*  

---

## 🚀 **Project Tree**  
```bash
src/
├── client/                # Browser-side runtime (WebSocket, Proxies)
├── server/                # Dev server (Express, dependency graph)
├── shared/                # Type-safe utilities
├── example/               # Demo app (stress-testing HMR)
└── experimental/          # Time-travel debugging (WIP)

test/                      # Brutalist tests (chaos engineering)
scripts/                   # Profiling/stress tools
```

---

## ⚡ **Core Features**  
- **Dependency Graph** (Topological sort + circular dep detection)  
- **State Preservation** (Proxies + WeakMap)  
- **Type-Safe HMR Protocol** (Discriminated unions + runtime checks)  
- **0-Dependency Module Reloading** (Dynamic `import()` + cache busting)  

---

## 🧪 **Science Mode**  
```bash
# Start the dev server
npm run dev

# Trigger a stress test (50 concurrent file changes)
npm run stress-test

# Profile for memory leaks
npm run profile
```

---

**HumanGPT Prompt**:  
*"Build me an HMR system where the type system is so strict it hurts—and make the dependency graph resolution feel like solving the Time Stone equations."*  

**License**: MIT (but I’d prefer you yell *"JARVIS, RELOAD MODULE!"* when using it)  

--- 

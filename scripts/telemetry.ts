import { Effect } from "effect"

// Effect's built-in logger includes the active span in log output.
const loadProfile = Effect.gen(function* () {
  yield* Effect.log("Loading profile")
  yield* Effect.sleep("100 millis")
  yield* Effect.annotateCurrentSpan("profile.id", "user-42")
  return { id: "user-42", name: "Ada" }
}).pipe(Effect.withSpan("load-profile"))

const program = Effect.gen(function* () {
  yield* Effect.log("Starting telemetry demo")
  const profile = yield* loadProfile
  yield* Effect.log("Profile loaded", { profile: profile.name })
}).pipe(Effect.withSpan("telemetry-demo"))

Effect.runPromise(program)

const fetchUser = Effect.gen(function* () {
  yield* Effect.sleep("100 millis")
  return { id: 1 }
}).pipe(
  Effect.withSpan("fetchUser")
)

const program2 = Effect.gen(function* () {
  yield* fetchUser
}).pipe(
  Effect.withSpan("handleRequest")
)



Effect.runPromise(program2)

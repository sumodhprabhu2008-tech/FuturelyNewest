# FIX 07 — Unify the Two Duplicate Portal Connect Flows

## Priority: MEDIUM — Prevents user confusion and ensures both entry points work

---

## Context & Root Cause

There are currently TWO separate screens that attempt portal connection:

1. **`SchoolLoginScreen.tsx`** — The initial onboarding flow. After FIX_02,
   this now correctly calls `connectHac`/`connectPowerSchool`. It is reached
   via `RootNavigator` when `hasSchoolSession === false`.

2. **`PortalConnectScreen.tsx`** — A screen inside the Grade Portal tab that
   ALSO calls `connectHac`/`connectPowerSchool`. It is reached via
   `GradePortalNavigator` → `GradePortalDashboard` → "Connect Portal" button.

The problem: these two screens duplicate credential entry logic, have
slightly different district URL lists, and different error message styles.
More critically, after FIX_02, `SchoolLoginScreen` creates the backend
session — but `PortalConnectScreen` would create a SECOND session, overwriting
the first one in the session store. If a user connects via `SchoolLoginScreen`
and then navigates to `PortalConnectScreen`, they see a disconnected state
because the portal status check hits the second route before the session
is verified.

The fix: make `PortalConnectScreen` check if already connected and show
status rather than a duplicate form. If not connected, `PortalConnectScreen`
should delegate to `SchoolLoginScreen` rather than duplicate the form.
Also ensure `GradePortalDashboard`'s connection status accurately reflects
the in-memory session state.

---

## Files You Must Read Before Editing

```
nextstep-mobile/src/screens/PortalConnectScreen.tsx
nextstep-mobile/src/screens/SchoolLoginScreen.tsx
nextstep-mobile/src/screens/GradePortalDashboard.tsx
nextstep-mobile/src/navigation/GradePortalNavigator.tsx
nextstep-mobile/src/navigation/RootNavigator.tsx
nextstep-mobile/src/api/portalApi.ts
nextstep-mobile/src/context/SchoolSessionContext.tsx
```

Read ALL of these fully before writing any code.

---

## Part A — Update `GradePortalDashboard.tsx` to Show Real Connection Status

### Step 1: Confirm the existing status fetch

In `GradePortalDashboard.tsx`, locate where `getPortalStatus()` is called.
It should already be called in a `useEffect` on mount. Verify this.

If it is NOT already calling `getPortalStatus()`, add it:

```typescript
import { getPortalStatus, disconnectPortal, type PortalStatus } from '../api/portalApi'

// Inside component:
const [status, setStatus] = useState<PortalStatus | null>(null)
const [statusLoading, setStatusLoading] = useState(true)

useEffect(() => {
  let mounted = true
  getPortalStatus()
    .then(s => { if (mounted) setStatus(s) })
    .catch(() => { if (mounted) setStatus(null) })
    .finally(() => { if (mounted) setStatusLoading(false) })
  return () => { mounted = false }
}, [])
```

### Step 2: Display connection status in the header area

Find the connection status display in `GradePortalDashboard.tsx`.
Make it show one of three states:

**Connected state** — green indicator, district name, last synced:
```typescript
{status?.connected ? (
  <View style={styles.connectedBanner}>
    <View style={styles.connectedDot} />
    <Text style={styles.connectedText}>
      Connected · {status.districtUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? 'School Portal'}
    </Text>
    <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
      <Text style={styles.disconnectText}>Disconnect</Text>
    </TouchableOpacity>
  </View>
) : (
  <TouchableOpacity
    style={styles.connectBanner}
    onPress={() => navigation.navigate('PortalConnect')}
  >
    <Ionicons name="link-outline" size={16} color={colors.warning} />
    <Text style={styles.connectBannerText}>Tap to connect your school portal</Text>
  </TouchableOpacity>
)}
```

Add these styles if they do not already exist:
```typescript
connectedBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: `${colors.success}18`,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 8,
  marginHorizontal: 16,
  marginBottom: 8,
  gap: 8,
},
connectedDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: colors.success,
},
connectedText: {
  flex: 1,
  fontSize: 12,
  color: colors.success,
  fontWeight: '600',
},
disconnectBtn: {
  paddingHorizontal: 8,
  paddingVertical: 4,
},
disconnectText: {
  fontSize: 12,
  color: colors.error,
},
connectBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  backgroundColor: `${colors.warning}18`,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 8,
  marginHorizontal: 16,
  marginBottom: 8,
},
connectBannerText: {
  fontSize: 12,
  color: colors.warning,
  fontWeight: '600',
},
```

### Step 3: Refresh status on screen focus

```typescript
useFocusEffect(
  useCallback(() => {
    setStatusLoading(true)
    getPortalStatus()
      .then(s => setStatus(s))
      .catch(() => setStatus(null))
      .finally(() => setStatusLoading(false))
  }, [])
)
```

---

## Part B — Rebuild `PortalConnectScreen.tsx` as a Smart Router

`PortalConnectScreen` should no longer be a duplicate login form.
Instead it becomes a "connection manager" screen that:
- Shows current connection status if already connected
- Shows a "reconnect" option if session expired but metadata exists
- Shows the full form ONLY if no connection has ever been made

### Replace the screen content with a status-aware layout:

```typescript
export default function PortalConnectScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const { schoolInfo } = useSchoolSession()
  const [status, setStatus] = useState<PortalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getPortalStatus()
      setStatus(s)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void loadStatus() }, [loadStatus]))

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await disconnectPortal()
      await loadStatus()
    } catch (e) {
      // show error
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="School Portal" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    )
  }

  // Already connected — show status card
  if (status?.connected) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="School Portal" />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={styles.greenDot} />
              <Text variant="h3" style={{ color: colors.success }}>Connected</Text>
            </View>
            <Text variant="body" style={{ color: colors.textSecondary, marginTop: 4 }}>
              {status.systemType ?? 'Portal'} · {status.districtUrl?.replace(/^https?:\/\//, '') ?? ''}
            </Text>
            {status.lastSynced && (
              <Text variant="caption" style={{ color: colors.textMuted, marginTop: 4 }}>
                Last synced: {new Date(status.lastSynced).toLocaleString()}
              </Text>
            )}
            <Text variant="caption" style={{ color: colors.textMuted, marginTop: 4 }}>
              Session expires in: {Math.floor(status.sessionExpiresIn / 60)}m {status.sessionExpiresIn % 60}s
            </Text>
          </View>

          <Button
            label={disconnecting ? 'Disconnecting…' : 'Disconnect Portal'}
            onPress={handleDisconnect}
            style={{ marginTop: 24, backgroundColor: colors.error }}
          />

          <Text variant="caption" style={{ textAlign: 'center', color: colors.textMuted, marginTop: 16 }}>
            Disconnecting will not delete your school data. You can reconnect at any time.
          </Text>
        </ScrollView>
      </View>
    )
  }

  // Not connected — show connect form (re-use SchoolLoginScreen logic inline)
  // IMPORTANT: Keep the existing form JSX from PortalConnectScreen here
  // so that users who arrive here after session expiry can reconnect
  // without navigating away. The form here is INTENTIONAL as a fallback.
  // It calls connectHac/connectPowerSchool directly like FIX_02 specified.
  return (
    // ... keep existing PortalConnectScreen form JSX exactly as-is ...
    // Do NOT remove the form — just wrap it with the connected-state check above
  )
}
```

**IMPORTANT**: Keep ALL existing form JSX from `PortalConnectScreen`.
Only ADD the connected-state early return above it. Do not delete the form.

---

## Part C — Ensure `GradePortalNavigator` Exports `PortalConnect` Route

Open `nextstep-mobile/src/navigation/GradePortalNavigator.tsx`.
Verify `PortalConnect` is registered as a screen. If it is not, add it:

```typescript
<Stack.Screen name="PortalConnect" component={PortalConnectScreen} />
```

---

## TypeScript Requirements

```bash
cd nextstep-mobile
npx tsc --noEmit
```

Zero errors required.

---

## Acceptance Criteria

- [ ] `GradePortalDashboard` shows green "Connected" banner when session active
- [ ] `GradePortalDashboard` shows orange "Tap to connect" when not connected
- [ ] `PortalConnectScreen` shows connection status card when already connected
- [ ] `PortalConnectScreen` still has the connect form for the not-connected state
- [ ] Disconnect button works and refreshes status
- [ ] Status refreshes on screen focus
- [ ] `npx tsc --noEmit` passes in `nextstep-mobile/`

## What NOT to Do

- Do NOT remove the connect form from `PortalConnectScreen`
- Do NOT change `SchoolLoginScreen` in this fix
- Do NOT add a new navigation route — use existing `PortalConnect`

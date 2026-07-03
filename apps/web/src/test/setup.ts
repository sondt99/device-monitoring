import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL only auto-registers cleanup when `afterEach` is a global (vitest
// `globals: true`), which this project doesn't enable — register it manually
// so component trees don't leak between tests in the same file.
afterEach(cleanup);

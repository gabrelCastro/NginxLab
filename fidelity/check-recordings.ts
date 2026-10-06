import { execFileSync } from 'node:child_process'

execFileSync('npm', ['run', 'fidelity:record'], { stdio: 'inherit' })
execFileSync('git', ['diff', '--exit-code', '--', 'fidelity/recorded'], { stdio: 'inherit' })

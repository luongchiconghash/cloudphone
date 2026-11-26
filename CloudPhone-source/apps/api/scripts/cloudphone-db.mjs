import { spawnSync } from 'node:child_process'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'

const require = createRequire(import.meta.url)
const project = new URL('../', import.meta.url)

function wrangler(args, json = false) {
  const packageFile = require.resolve.paths('wrangler')
    .map((directory) => join(directory, 'wrangler', 'package.json'))
    .find(existsSync)
  if (!packageFile) throw new Error('Chạy npm ci trước khi dùng Wrangler.')

  const { bin } = JSON.parse(readFileSync(packageFile, 'utf8'))
  const result = spawnSync(process.execPath, [join(dirname(packageFile), bin.wrangler ?? bin), ...args], {
    cwd: project,
    encoding: 'utf8',
    stdio: json ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Lệnh Wrangler thất bại.')
  return json ? JSON.parse(result.stdout) : undefined
}

function verifyRemoteDatabase() {
  const config = readFileSync(new URL('wrangler.toml', project), 'utf8')
  const worker = config.match(/^name\s*=\s*"([^"]+)"/m)?.[1]
  const database = config.match(/^database_name\s*=\s*"([^"]+)"/m)?.[1]
  const id = config.match(/^database_id\s*=\s*"([a-f0-9-]+)"/m)?.[1]
  if (worker !== 'cloudphone' || database !== 'cloudphone' || !id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id)) {
    throw new Error('Tạo D1 cloudphone và điền UUID của D1 này trước khi thao tác từ xa.')
  }
  const databases = wrangler(['d1', 'list', '--json'], true)
  if (!Array.isArray(databases) || !databases.some((db) => db.name === 'cloudphone' && db.uuid === id)) {
    throw new Error('UUID trong cấu hình không khớp với D1 cloudphone của tài khoản hiện tại.')
  }
}

async function createStaff(username, target) {
  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username ?? '') || !['--local', '--remote'].includes(target)) {
    throw new Error('Cú pháp: npm run db:create-staff -w apps/api -- <tên-tài-khoản> --local|--remote')
  }
  if (target === '--remote') verifyRemoteDatabase()

  const mutedOutput = new Writable({ write(_chunk, _encoding, done) { done() } })
  const input = createInterface({ input: process.stdin, output: mutedOutput, terminal: !!process.stdin.isTTY, historySize: 0 })
  let password
  try {
    process.stderr.write('Mật khẩu quản trị (12–128 ký tự, nội dung được ẩn): ')
    password = await input.question('')
  } finally {
    input.close()
    process.stderr.write('\n')
  }
  if (password.length < 12 || password.length > 128) throw new Error('Mật khẩu phải dài từ 12 đến 128 ký tự.')

  const salt = randomBytes(16)
  const digest = pbkdf2Sync(password, salt, 100_000, 32, 'sha512')
  const hash = ['pbkdf2-sha512', '100000', salt.toString('hex'), digest.toString('hex')].join('$')
  const directory = mkdtempSync(join(tmpdir(), 'cloudphone-staff-'))
  const sqlFile = join(directory, 'create-staff.sql')
  try {
    writeFileSync(sqlFile, `
      INSERT INTO users (username, password_hash, role)
      VALUES ('${username}', '${hash}', 'admin');
    `, { encoding: 'utf8', mode: 0o600 })
    wrangler(['d1', 'execute', 'cloudphone', target, '--file', sqlFile, '--json', '--yes'], true)
    console.log('Đã tạo tài khoản quản trị CloudPhone.')
  } finally {
    if (existsSync(sqlFile)) unlinkSync(sqlFile)
    rmdirSync(directory)
  }
}

try {
  const [command, username, target] = process.argv.slice(2)
  if (command === 'staff') {
    await createStaff(username, target)
  } else if (command === 'migrate' || command === 'deploy') {
    verifyRemoteDatabase()
    wrangler(command === 'migrate' ? ['d1', 'migrations', 'apply', 'cloudphone', '--remote'] : ['deploy'])
  } else {
    throw new Error('Lệnh CloudPhone không hợp lệ.')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}


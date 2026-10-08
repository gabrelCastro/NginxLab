import { describe, expect, it } from 'vitest'
import { missionScenarios, validateMission } from './catalog'
import { createTerminalState, executeCommand } from '../sim/terminal'

describe('missão das imagens', () => {
  for (const variant of ['catalog', 'transfer'] as const) {
    it(`${variant}: reproduz a falha e aceita a correção pelo comportamento`, () => {
      const scenario = missionScenarios[variant]
      const original = createTerminalState(scenario.initialConfig, scenario.files)
      const missing = executeCommand(original, `curl -i http://localhost${scenario.imageUri}`)
      expect(missing.response?.status).toBe(404)
      expect(missing.response?.trace).toContainEqual(expect.objectContaining({ title: expect.stringMatching(/^root /), detail: expect.stringContaining(scenario.imageUri), line: 9 }))
      expect(validateMission(original.activeSource, variant).ok).toBe(false)

      const corrected = scenario.initialConfig.replace(/root (\/data\/catalogo|\/opt\/produtos);/, 'alias $1;')
      const tested = executeCommand({ ...original, draftSource: corrected }, 'nginx -t')
      expect(tested.success).toBe(true)
      const reloaded = executeCommand(tested.state, 'nginx -s reload')
      expect(reloaded.success).toBe(true)
      expect(validateMission(reloaded.state.activeSource, variant)).toMatchObject({ ok: true, home: true, image: true })
      expect(original.activeSource).toBe(scenario.initialConfig)
    })
  }

  it('recusa status 200 artificiais e regressão da página inicial', () => {
    const scenario = missionScenarios.catalog
    const artificial = scenario.initialConfig.replace('root /data/catalogo;', 'return 200 "ok";')
    expect(validateMission(artificial, 'catalog').image).toBe(false)
    const brokenHome = scenario.initialConfig.replace('root /srv/loja;', 'root /outra-pasta;').replace('root /data/catalogo;', 'alias /data/catalogo;')
    expect(validateMission(brokenHome, 'catalog')).toMatchObject({ ok: false, home: false, image: true })
  })

  it('revisão integrada exige imagem, rota da aplicação e site padrão corretos', () => {
    const scenario = missionScenarios.integration
    const original = createTerminalState(scenario.initialConfig, scenario.files)
    expect(validateMission(original.activeSource, 'integration')).toMatchObject({ ok: false, home: true, image: false, route: false, fallback: true })

    const imageOnly = scenario.initialConfig.replace('root /data/catalogo;', 'alias /data/catalogo;')
    expect(validateMission(imageOnly, 'integration')).toMatchObject({ ok: false, image: true, route: false })

    const corrected = imageOnly.replace('try_files $uri $uri/ =404;', 'try_files $uri $uri/ /index.html;')
    const tested = executeCommand({ ...original, draftSource: corrected }, 'nginx -t')
    expect(tested.success).toBe(true)
    const reloaded = executeCommand(tested.state, 'nginx -s reload')
    expect(reloaded.success).toBe(true)
    expect(validateMission(reloaded.state.activeSource, 'integration')).toMatchObject({ ok: true, home: true, image: true, route: true, fallback: true })

    const brokenDefault = corrected.replace('return 404 "site desconhecido";', 'return 200 "loja";')
    expect(validateMission(brokenDefault, 'integration')).toMatchObject({ ok: false, home: true, image: true, route: true, fallback: false })
  })
})

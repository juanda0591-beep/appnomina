export default async function run(page, ui) {
  // Capturar errores
  const consoleMessages = []
  const errors = []

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() })
  })

  page.on('pageerror', error => {
    errors.push({ message: error.message, stack: error.stack })
  })

  // Login
  await page.getByPlaceholder('Tu usuario').fill('admin')
  await page.getByPlaceholder('Tu contraseña').fill('admin123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForTimeout(1500)

  // Ir a Clientes
  await page.goto('http://localhost:5173/clientes')
  await page.waitForTimeout(3000)

  const text = await page.textContent('body')

  return {
    textLength: text.length,
    consoleErrors: consoleMessages.filter(m => m.type === 'error'),
    pageErrors: errors
  }
}

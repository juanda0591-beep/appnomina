export default async function run(page, ui) {
  // Login
  await page.getByPlaceholder('Tu usuario').fill('admin')
  await page.getByPlaceholder('Tu contraseña').fill('admin123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForTimeout(1500)

  // Ir a Gestión de Nómina
  await page.goto('http://localhost:5173/gestion-nomina')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'gestion-nomina-result.png' })

  // Ir a Clientes
  await page.goto('http://localhost:5173/clientes')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'clientes-result.png' })

  // Capturar errores de consola
  const errors = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })

  await page.waitForTimeout(1000)

  return {
    gestionNominaScreenshot: 'gestion-nomina-result.png',
    clientesScreenshot: 'clientes-result.png',
    errors
  }
}

export default async function run(page, ui) {
  // Login
  await page.getByPlaceholder('Tu usuario').fill('admin')
  await page.getByPlaceholder('Tu contraseña').fill('admin123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForTimeout(1500)

  // Ir a Clientes y esperar más tiempo
  await page.goto('http://localhost:5173/clientes')

  // Esperar 5 segundos y verificar cada segundo qué hay en pantalla
  const checks = []
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1000)
    const text = await page.textContent('body')
    checks.push({
      segundo: i + 1,
      textLength: text.length,
      hasCargando: text.includes('Cargando'),
      hasClientes: text.includes('Clientes'),
      preview: text.substring(0, 100)
    })
  }

  return { checks }
}

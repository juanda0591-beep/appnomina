export default async function run(page, ui) {
  // Login usando selectores de Playwright
  await page.getByPlaceholder('Tu usuario').fill('admin')
  await page.getByPlaceholder('Tu contraseña').fill('admin123')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await page.waitForTimeout(1500)

  // Ir a Gestión de Nómina
  await page.goto('http://localhost:5173/gestion-nomina')
  await page.waitForTimeout(2000)

  const text1 = await page.textContent('body')
  const title1 = await page.title()

  // Ir a Clientes
  await page.goto('http://localhost:5173/clientes')
  await page.waitForTimeout(2000)

  const text2 = await page.textContent('body')

  return {
    gestionNomina: {
      title: title1,
      textLength: text1.length,
      hasContent: text1.includes('Gestión de Nómina'),
      hasCargando: text1.includes('Cargando'),
      preview: text1.substring(0, 200)
    },
    clientes: {
      textLength: text2.length,
      hasContent: text2.includes('Clientes'),
      hasCargando: text2.includes('Cargando'),
      preview: text2.substring(0, 200)
    }
  }
}

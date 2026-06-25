package com.vacation.budget.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = OceanBlue,
    onPrimary = CardSurface,
    primaryContainer = Color(0xFFD0EAFF),
    onPrimaryContainer = OceanBlueDark,
    secondary = CoralSunset,
    onSecondary = CardSurface,
    secondaryContainer = Color(0xFFFFE8DE),
    onSecondaryContainer = Color(0xFF8B3000),
    tertiary = TropicalTeal,
    onTertiary = CardSurface,
    tertiaryContainer = Color(0xFFD0F5F3),
    background = LightBackground,
    onBackground = TextPrimary,
    surface = CardSurface,
    onSurface = TextPrimary,
    surfaceVariant = Color(0xFFEEF4FF),
    onSurfaceVariant = TextSecondary,
    error = DangerRed,
    outline = Color(0xFFD1D9E8)
)

private val DarkColorScheme = darkColorScheme(
    primary = SkyBlue,
    onPrimary = DarkSurface,
    primaryContainer = OceanBlueDark,
    onPrimaryContainer = Color(0xFFD0EAFF),
    secondary = CoralSunset,
    onSecondary = DarkSurface,
    secondaryContainer = Color(0xFF8B3000),
    onSecondaryContainer = Color(0xFFFFE8DE),
    tertiary = TropicalTeal,
    onTertiary = DarkSurface,
    background = DarkSurface,
    onBackground = Color(0xFFE8EEFF),
    surface = DarkCard,
    onSurface = Color(0xFFE8EEFF),
    surfaceVariant = Color(0xFF2D3050),
    onSurfaceVariant = Color(0xFFA8B4D0),
    error = Color(0xFFFF7070),
    outline = Color(0xFF3D4266)
)

@Composable
fun VacationBudgetTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

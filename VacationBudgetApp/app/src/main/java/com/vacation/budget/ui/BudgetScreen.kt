package com.vacation.budget.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vacation.budget.UiState
import com.vacation.budget.VacationViewModel
import com.vacation.budget.data.Expense
import com.vacation.budget.data.ExpenseCategory
import com.vacation.budget.ui.theme.*
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetScreen(viewModel: VacationViewModel) {
    val uiState by viewModel.uiState.collectAsState()
    var showAddExpense by remember { mutableStateOf(false) }
    var showEditBudget by remember { mutableStateOf(false) }
    var expenseToEdit by remember { mutableStateOf<Expense?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }
    var deletedExpense by remember { mutableStateOf<Expense?>(null) }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showAddExpense = true },
                icon = { Icon(Icons.Default.Add, "Add expense") },
                text = { Text("Add Expense") },
                containerColor = MaterialTheme.colorScheme.secondary,
                contentColor = MaterialTheme.colorScheme.onSecondary
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            contentPadding = PaddingValues(
                top = 0.dp,
                start = 0.dp,
                end = 0.dp,
                bottom = padding.calculateBottomPadding() + 88.dp
            )
        ) {
            item {
                BudgetHeroCard(uiState, onEditBudget = { showEditBudget = true })
            }
            item {
                StatsRow(uiState)
            }
            item {
                CategoryFilterRow(uiState.selectedCategory, viewModel::setCategory)
            }
            item {
                SectionHeader(
                    title = "Expenses",
                    count = uiState.filteredExpenses.size
                )
            }
            if (uiState.filteredExpenses.isEmpty()) {
                item { EmptyState() }
            } else {
                items(uiState.filteredExpenses, key = { it.id }) { expense ->
                    ExpenseCard(
                        expense = expense,
                        currency = uiState.budget.currency,
                        onEdit = { expenseToEdit = it },
                        onDelete = { exp ->
                            deletedExpense = exp
                            viewModel.deleteExpense(exp)
                        }
                    )
                }
            }
        }
    }

    LaunchedEffect(deletedExpense) {
        deletedExpense?.let { exp ->
            val result = snackbarHostState.showSnackbar(
                message = "${exp.name} deleted",
                actionLabel = "Undo",
                duration = SnackbarDuration.Short
            )
            if (result == SnackbarResult.ActionPerformed) {
                viewModel.addExpense(exp)
            }
            deletedExpense = null
        }
    }

    if (showAddExpense) {
        ExpenseDialog(
            expense = null,
            currency = uiState.budget.currency,
            onDismiss = { showAddExpense = false },
            onSave = { viewModel.addExpense(it); showAddExpense = false }
        )
    }

    expenseToEdit?.let { expense ->
        ExpenseDialog(
            expense = expense,
            currency = uiState.budget.currency,
            onDismiss = { expenseToEdit = null },
            onSave = { viewModel.updateExpense(it); expenseToEdit = null }
        )
    }

    if (showEditBudget) {
        BudgetDialog(
            budget = uiState.budget,
            onDismiss = { showEditBudget = false },
            onSave = { viewModel.updateBudget(it); showEditBudget = false }
        )
    }
}

@Composable
private fun BudgetHeroCard(uiState: UiState, onEditBudget: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(OceanBlue, SkyBlue)
                )
            )
            .padding(24.dp)
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = uiState.budget.tripName,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White.copy(alpha = 0.85f)
                    )
                    if (uiState.budget.destination.isNotBlank()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = Color.White.copy(alpha = 0.7f),
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(2.dp))
                            Text(
                                uiState.budget.destination,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
                IconButton(
                    onClick = onEditBudget,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.2f))
                ) {
                    Icon(Icons.Default.Edit, "Edit budget", tint = Color.White)
                }
            }

            Spacer(Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Total Budget",
                        style = MaterialTheme.typography.labelMedium,
                        color = Color.White.copy(alpha = 0.75f)
                    )
                    Text(
                        formatCurrency(uiState.budget.totalAmount, uiState.budget.currency),
                        style = MaterialTheme.typography.displayLarge.copy(fontSize = 38.sp),
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
                BudgetDonut(
                    percent = uiState.percentUsed,
                    isOver = uiState.isOverBudget
                )
            }

            Spacer(Modifier.height(20.dp))

            LinearProgressIndicator(
                progress = { uiState.percentUsed.coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
                color = when {
                    uiState.isOverBudget -> DangerRed
                    uiState.percentUsed > 0.75f -> WarningAmber
                    else -> BudgetGreen
                },
                trackColor = Color.White.copy(alpha = 0.3f)
            )

            Spacer(Modifier.height(8.dp))
            Text(
                "${(uiState.percentUsed * 100).toInt()}% of budget used",
                style = MaterialTheme.typography.labelMedium,
                color = Color.White.copy(alpha = 0.75f)
            )
        }
    }
}

@Composable
private fun BudgetDonut(percent: Float, isOver: Boolean) {
    val animatedPercent by animateFloatAsState(
        targetValue = percent.coerceIn(0f, 1f),
        animationSpec = tween(durationMillis = 1000, easing = EaseOutCubic),
        label = "donut"
    )
    val color = when {
        isOver -> DangerRed
        percent > 0.75f -> WarningAmber
        else -> BudgetGreen
    }

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(80.dp)) {
        Canvas(modifier = Modifier.size(80.dp)) {
            val stroke = Stroke(width = 10.dp.toPx(), cap = StrokeCap.Round)
            drawArc(
                color = Color.White.copy(alpha = 0.25f),
                startAngle = -90f, sweepAngle = 360f,
                useCenter = false, style = stroke
            )
            drawArc(
                color = color,
                startAngle = -90f, sweepAngle = 360f * animatedPercent,
                useCenter = false, style = stroke
            )
        }
        Text(
            "${(percent * 100).toInt()}%",
            style = MaterialTheme.typography.labelLarge,
            color = Color.White,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun StatsRow(uiState: UiState) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        StatItem(
            label = "Spent",
            value = formatCurrency(uiState.totalSpent, uiState.budget.currency),
            color = CoralSunset,
            icon = Icons.Default.TrendingUp
        )
        VerticalDivider(modifier = Modifier.height(48.dp))
        StatItem(
            label = "Remaining",
            value = formatCurrency(uiState.remaining, uiState.budget.currency),
            color = if (uiState.isOverBudget) DangerRed else BudgetGreen,
            icon = if (uiState.isOverBudget) Icons.Default.Warning else Icons.Default.Savings
        )
        VerticalDivider(modifier = Modifier.height(48.dp))
        StatItem(
            label = "Expenses",
            value = "${uiState.expenses.size}",
            color = TropicalTeal,
            icon = Icons.Default.Receipt
        )
    }
    HorizontalDivider()
}

@Composable
private fun StatItem(label: String, value: String, color: Color, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
        Spacer(Modifier.height(4.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategoryFilterRow(selectedCategory: String?, onSelect: (String?) -> Unit) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            FilterChip(
                selected = selectedCategory == null,
                onClick = { onSelect(null) },
                label = { Text("All") },
                leadingIcon = if (selectedCategory == null) {
                    { Icon(Icons.Default.Check, null, Modifier.size(16.dp)) }
                } else null
            )
        }
        items(ExpenseCategory.entries) { cat ->
            FilterChip(
                selected = selectedCategory == cat.name,
                onClick = { onSelect(if (selectedCategory == cat.name) null else cat.name) },
                label = { Text("${cat.emoji} ${cat.displayName}") },
                leadingIcon = if (selectedCategory == cat.name) {
                    { Icon(Icons.Default.Check, null, Modifier.size(16.dp)) }
                } else null
            )
        }
    }
    HorizontalDivider()
}

@Composable
private fun SectionHeader(title: String, count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        if (count > 0) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer
            ) {
                Text(
                    "$count",
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExpenseCard(
    expense: Expense,
    currency: String,
    onEdit: (Expense) -> Unit,
    onDelete: (Expense) -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDelete(expense)
                true
            } else false
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(16.dp))
                    .background(DangerRed),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = "Delete",
                    tint = Color.White,
                    modifier = Modifier.padding(end = 20.dp)
                )
            }
        }
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            onClick = { onEdit(expense) }
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Category icon circle
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(categoryColor(expense.categoryEnum).copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(expense.categoryEnum.emoji, fontSize = 22.sp)
                }

                Spacer(Modifier.width(14.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        expense.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.height(2.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(Modifier.width(2.dp))
                        Text(
                            expense.location.ifBlank { "No location" },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Text(
                        formatDate(expense.date),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                    )
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        formatCurrency(expense.amount, currency),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = CoralSunset
                    )
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = categoryColor(expense.categoryEnum).copy(alpha = 0.12f)
                    ) {
                        Text(
                            expense.categoryEnum.displayName,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelMedium,
                            color = categoryColor(expense.categoryEnum)
                        )
                    }
                }
            }
            if (expense.notes.isNotBlank()) {
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                Text(
                    expense.notes,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("✈️", fontSize = 56.sp)
        Spacer(Modifier.height(16.dp))
        Text(
            "No expenses yet",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            "Tap + to add your first expense",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

private fun categoryColor(category: ExpenseCategory): Color = when (category) {
    ExpenseCategory.FOOD -> Color(0xFFFF7043)
    ExpenseCategory.TRANSPORT -> Color(0xFF42A5F5)
    ExpenseCategory.ACCOMMODATION -> Color(0xFF7E57C2)
    ExpenseCategory.ACTIVITIES -> Color(0xFF26C6DA)
    ExpenseCategory.SHOPPING -> Color(0xFFEC407A)
    ExpenseCategory.OTHER -> Color(0xFF78909C)
}

fun formatCurrency(amount: Double, currency: String): String {
    val symbol = when (currency) {
        "USD" -> "$"
        "EUR" -> "€"
        "GBP" -> "£"
        "JPY" -> "¥"
        "CAD" -> "CA$"
        "AUD" -> "A$"
        "MXN" -> "MX$"
        else -> "$"
    }
    return if (amount < 0) "-$symbol${"%.2f".format(-amount)}"
    else "$symbol${"%.2f".format(amount)}"
}

fun formatDate(timestamp: Long): String =
    SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(timestamp))

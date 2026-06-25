package com.vacation.budget

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.vacation.budget.data.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class UiState(
    val budget: Budget = Budget(),
    val expenses: List<Expense> = emptyList(),
    val isLoading: Boolean = true,
    val selectedCategory: String? = null
) {
    val totalSpent: Double get() = expenses.sumOf { it.amount }
    val remaining: Double get() = budget.totalAmount - totalSpent
    val percentUsed: Float
        get() = if (budget.totalAmount > 0)
            (totalSpent / budget.totalAmount).toFloat().coerceIn(0f, 1.5f)
        else 0f
    val isOverBudget: Boolean get() = remaining < 0
    val filteredExpenses: List<Expense>
        get() = if (selectedCategory == null) expenses
        else expenses.filter { it.category == selectedCategory }
}

class VacationViewModel(application: Application) : AndroidViewModel(application) {
    private val db = AppDatabase.getInstance(application)
    private val repo = VacationRepository(db.expenseDao(), db.budgetDao())

    private val _selectedCategory = MutableStateFlow<String?>(null)
    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            combine(
                repo.getBudget(),
                repo.getAllExpenses(),
                _selectedCategory
            ) { budget, expenses, category ->
                UiState(
                    budget = budget ?: Budget(),
                    expenses = expenses,
                    isLoading = false,
                    selectedCategory = category
                )
            }.collect { _uiState.value = it }
        }
    }

    fun updateBudget(budget: Budget) = viewModelScope.launch { repo.saveBudget(budget) }
    fun addExpense(expense: Expense) = viewModelScope.launch { repo.insertExpense(expense) }
    fun updateExpense(expense: Expense) = viewModelScope.launch { repo.updateExpense(expense) }
    fun deleteExpense(expense: Expense) = viewModelScope.launch { repo.deleteExpense(expense) }
    fun setCategory(category: String?) { _selectedCategory.value = category }
}

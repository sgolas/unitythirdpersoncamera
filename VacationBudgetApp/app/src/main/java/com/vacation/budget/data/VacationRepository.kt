package com.vacation.budget.data

import kotlinx.coroutines.flow.Flow

class VacationRepository(
    private val expenseDao: ExpenseDao,
    private val budgetDao: BudgetDao
) {
    fun getAllExpenses(): Flow<List<Expense>> = expenseDao.getAllExpenses()
    fun getBudget(): Flow<Budget?> = budgetDao.getBudget()

    suspend fun insertExpense(expense: Expense) = expenseDao.insert(expense)
    suspend fun updateExpense(expense: Expense) = expenseDao.update(expense)
    suspend fun deleteExpense(expense: Expense) = expenseDao.delete(expense)
    suspend fun saveBudget(budget: Budget) = budgetDao.upsert(budget)
}

// Copyright [2016] [Banana.ch SA - Lugano Switzerland]
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// @api = 1.0
// @id = ch.banana.script.invoicedata.2017.js
// @description = Comunicazione fatture emesse e ricevute (file xml)
// @doctype = *;110
// @encoding = utf-8
// @exportfilename = IT99999999999_DF_00001
// @exportfiletype = xml
// @includejs = ch.banana.script.invoicedata.2017.createinstance.js
// @includejs = ch.banana.script.italianvatreport.2017.xml.js
// @includejs = ch.banana.script.italianvatreport.2017.errors.js
// @inputdatasource = none
// @pubdate = 2017-04-20
// @publisher = Banana.ch SA
// @task = export.file
// @timeout = -1

function exec(inData) {

  if (!Banana.document)
    return "@Cancel";

  var param = initParam();
  var savedParam = Banana.document.scriptReadSettings();
  if (savedParam.length > 0) {
    param = JSON.parse(savedParam);
  }
  param = verifyParam(param);
  
  // Ask period
  var selPeriod = Banana.Ui.getPeriod("Comunicazione fatture emesse e ricevute", Banana.document.startPeriod(), Banana.document.endPeriod(), param.repStartDate, param.repEndDate, true);
  if (!selPeriod)
    return "@Cancel";

  if (selPeriod.selectionChecked) {
    param.repStartDate = selPeriod.selectionStartDate;
    param.repEndDate = selPeriod.selectionEndDate;
  }
  else {
    param.repStartDate = selPeriod.startDate;
    param.repEndDate = selPeriod.endDate;
  }
  var bloccoId = 0;
  if (param.blocco == 'DTR')
    bloccoId = 1;
  var blocco = Banana.Ui.getItem("Comunicazione fatture emesse e ricevute", "Seleziona blocco", ["DTE","DTR"], bloccoId, false);
  if (!blocco)
    return "@Cancel";
  param.blocco = blocco;
  
  var paramToString = JSON.stringify(param);
  var value = Banana.document.scriptSaveSettings(paramToString);
  
  param = loadData(param);

  var output = createInstance(param);

  if (output != "@Cancel") {
    var report = Banana.Report.newReport("Dati delle fatture emesse e ricevute");
    var stylesheet = Banana.Report.newStyleSheet();
    printVatReport1(report, stylesheet, param);
    Banana.Report.preview(report, stylesheet);
  }

  return output;

}

/*
 * Get customer or supplier data from table Accounts
 */
function getAccount(accountId) {
  if (!accountId || accountId.length <= 0)
    return '';
  if (!Banana.document)
    return '';
  var tableAccounts = Banana.document.table('Accounts');
  if (tableAccounts) {
    var row = tableAccounts.findRowByValue('Account', accountId);
    if (row) {
      return row.toJSON();
    }
  }
  return '';
}

function getCountryCode(jsonObject) {
  var countryCode = '';
  if (!jsonObject)
    return countryCode;
  if (jsonObject["CountryCode"])
    countryCode = jsonObject["CountryCode"];
  else if (jsonObject["Country"])
    countryCode = jsonObject["Country"];
  countryCode = countryCode.toLowerCase();
  if (countryCode == 'italy' || countryCode == 'italia') {
    countryCode = 'it';
  }
  if (countryCode == 'germany' || countryCode == 'germania') {
    countryCode = 'de';
  }
  if (countryCode == 'france' || countryCode == 'francia') {
    countryCode = 'fr';
  }
  return countryCode.toUpperCase();
}

function initParam()
{
  var param = {};
  param.repStartDate = '';
  param.repEndDate = '';
  if (Banana.document) {
    param.repStartDate = Banana.document.startPeriod();
    param.repEndDate = Banana.document.endPeriod();
  }
  param.blocco = 'DTE';
  return param;
}

function init_namespaces()
{
  var ns = [
    {
      'namespace' : 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v2.0',
      'prefix' : 'xmlns:df'
    },
    {
      'namespace' : 'http://www.w3.org/2001/XMLSchema-instance',
      'prefix' : 'xmlns:xsi'
    },
  ];
  return ns;
}
function init_schemarefs()
{
  var schemaRefs = [
    'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v2.0 DatiFattura_v2.0.xsd',
  ];
  return schemaRefs;
};

function loadData(param)
{
  param.schemaRefs = init_schemarefs();
  param.namespaces = init_namespaces();

  var journal = Banana.document.journal(
    Banana.document.ORIGINTYPE_CURRENT, Banana.document.ACCOUNTTYPE_NORMAL);
  var filteredRows = journal.findRows(loadData_filterTransactions);

  if (!journal || !filteredRows)
    return false;

  //Load customers/suppliers accounts
  var periodStart = Banana.Converter.stringToDate(param.repStartDate);
  var periodEnd = Banana.Converter.stringToDate(param.repEndDate);
  param.customers = {};
  param.suppliers = {};

  for (var i = 0; i < filteredRows.length; i++) {
    //Check period
    var validPeriod = false;
    var value = filteredRows[i].value("JDate");
    var currentDate = Banana.Converter.stringToDate(value, "YYYY-MM-DD");
    if (currentDate >= periodStart && currentDate <= periodEnd)
      validPeriod = true;
    if (!validPeriod)
      continue;

    //Only rows with JInvoiceRowCustomerSupplier=1 (customer) or JInvoiceRowCustomerSupplier=2 (supplier)
    var keepRow=false;
    var isCustomer = filteredRows[i].value("JInvoiceRowCustomerSupplier");
    if (param.blocco == 'DTE' && isCustomer=='1')
      keepRow=true;
    if (param.blocco == 'DTR' && isCustomer=='2')
      keepRow=true;
    if (!keepRow)
      continue;

    var accountId = filteredRows[i].value("JAccount");
    if (accountId && accountId.length>0) {
      var accountObj = JSON.parse(getAccount(accountId));
      if (accountObj) {
        if (isCustomer == '1') {
          param.customers[accountId] = accountObj;
        }
        else if (isCustomer == '2') {
          param.suppliers[accountId] = accountObj;
        }
      }
    }
  }

  //Load rows
  var tableVatCodes = Banana.document.table('VatCodes');
  var tColumnNames = journal.columnNames;
  
  for (var i = 0; i < filteredRows.length; i++) {
    //Checks period
    var validPeriod = false;
    var value = filteredRows[i].value("JDate");
    var currentDate = Banana.Converter.stringToDate(value, "YYYY-MM-DD");
    if (currentDate >= periodStart && currentDate <= periodEnd)
      validPeriod = true;
    if (!validPeriod)
      continue;

    //Checks vatCode
    var vatCode = filteredRows[i].value("JVatCodeWithoutSign");
    if (vatCode.length<=0)
      continue;

   //Checks if customer/supplier row
   var isCustomer = filteredRows[i].value("JInvoiceRowCustomerSupplier");
   if (isCustomer)
     continue;

   //Checks customer or supplier accounts
   var isCustomer=false;
   var isSupplier=false;
   var accountId = filteredRows[i].value("JAccount");
   var contraAccountId = filteredRows[i].value("JContraAccount");
   if (accountId in param.customers) {
     isCustomer = true;
   }
   if (contraAccountId in param.customers) {
     isCustomer = true;
     accountId = contraAccountId;
   }
   if (accountId in param.suppliers) {
     isSupplier = true;
   }
   if (contraAccountId in param.suppliers) {
     isSupplier = true;
     accountId = contraAccountId;
   }
   if (!isCustomer && !isSupplier)
     continue;

    //Add data from journal
    var jsonLine = {};
    for (var j = 0; j < tColumnNames.length; j++) {
      var columnName = tColumnNames[j];
      value = filteredRows[i].value(columnName);
      if (value)
        jsonLine[columnName] = value;
      else
        jsonLine[columnName] = '';
    }

    //additional data

    //DF_TipoDoc
    //TD01 Fattura  
    //TD04 Nota di credito  
    //TD05 Nota di debito
    //TD07 Fattura semplificata
    //TD08 Nota di credito semplificata
    //TD10 Fattura di acquisto intracomunitario beni
    //TD11 Fattura di acquisto intracomunitario servizi
    jsonLine["DF_TipoDoc"] = '';
    value = filteredRows[i].value("JInvoiceDocType");
    if (value.length<=0)
      value =  filteredRows[i].value("DocType");
    if (value == 10 || value == 20)
      jsonLine["DF_TipoDoc"] = 'TD01';
    else if (value == 12 || value == 22)
      jsonLine["DF_TipoDoc"] = 'TD04';
    if (jsonLine["JVatNegative"]  == '1')
      jsonLine["DF_TipoDoc"] = 'TD04';

    //DF_Aliquota
    jsonLine["DF_Aliquota"] = '';
    value = filteredRows[i].value("VatRate");
    if (Banana.SDecimal.isZero(value))
      value = '0.00';
    else
      value = Banana.SDecimal.abs(value);
    jsonLine["DF_Aliquota"] = value;

    //DF_Imponibile
    jsonLine["DF_Imponibile"] = '';
    value = filteredRows[i].value("JVatTaxable");
    if (Banana.SDecimal.isZero(value))
      value = '0.00';
    else
      value = Banana.SDecimal.abs(value);
    jsonLine["DF_Imponibile"] = value;

    //DF_Imposta
    jsonLine["DF_Imposta"] = '';
    value = filteredRows[i].value("VatPosted");
    if (Banana.SDecimal.isZero(value))
      value = '0.00';
    else
      value = Banana.SDecimal.abs(value);
    jsonLine["DF_Imposta"] = value;

    //DF_Detraibile
    //DF_Deducibile
    jsonLine["DF_Detraibile"] = '';
    jsonLine["DF_Deducibile"] = '';
    value = filteredRows[i].value("VatNonDeductible");
    if (!Banana.SDecimal.isZero(value)) {
      value = Banana.SDecimal.add(filteredRows[i].value("JVatTaxable"), filteredRows[i].value("VatNonDeductible"));
      if (!Banana.SDecimal.isZero(value)) {
        value = Banana.SDecimal.abs(value);
        jsonLine["DF_Detraibile"] = value;
        jsonLine["DF_Deducibile"] = "SI";
      }
    }

    //DF_Lordo
    jsonLine["DF_Lordo"] = '';
    value = Banana.SDecimal.add(filteredRows[i].value("JVatTaxable"), filteredRows[i].value("VatAmount"));
    if (Banana.SDecimal.isZero(value))
      value = '0.00';
    else
      value = Banana.SDecimal.abs(value);
    jsonLine["DF_Lordo"] = value;

    //DF_Natura
    //N1 escluse ex art. 15
    //N2 non soggette
    //N3 non imponibili
    //N4 esenti
    //N5 regime del margine / IVA non esposta in fattura
    //N6 inversione contabile (reverse charge)
    //N7 IVA assolta in altro stato UE 
    jsonLine["DF_Natura"] = '';
    if (Banana.document && vatCode.length) {
      if (tableVatCodes) {
        var rowVatCodes = tableVatCodes.findRowByValue('VatCode', vatCode);
        if (rowVatCodes) {
          var vatGr = rowVatCodes.value("Gr");
          if (vatGr && vatGr.startsWith("V-NI") || vatGr.startsWith("A-NI")) {
            jsonLine["DF_Natura"] = 'N3';
          }
          else if (vatGr && vatGr.startsWith("V-ES") || vatGr.startsWith("A-ES")) {
            jsonLine["DF_Natura"] = 'N4';
          }
          else if (vatGr && vatGr.startsWith("V-NE") || vatGr.startsWith("A-NE")) {
            jsonLine["DF_Natura"] = 'N5';
          }
          else if (vatGr && vatGr.indexOf("-REV")>=0) {
            jsonLine["DF_Natura"] = 'N6';
            jsonLine["DF_Imponibile"] = '0.00';
            jsonLine["DF_Imposta"] = '';
            jsonLine["DF_Aliquota"] = '';
            jsonLine["DF_Detraibile"] = '';
            jsonLine["DF_Deducibile"] = '';
            jsonLine["DF_Lordo"] = '';
          }
        }
      }
    }

    //Controllo DF_Natura e aliquota
    value = jsonLine["DF_Aliquota"];
    if (!Banana.SDecimal.isZero(value) && jsonLine["DF_Natura"].length>0) {
      var msg = getErrorMessage(ID_ERR_XML_ELEMENTO_NATURA_PRESENTE);
      var rowNumber = jsonLine["JRowOrigin"];
      //Banana.document.table('Transactions').addMessage(msg, rowNumber, "Transactions", ID_ERR_XML_ELEMENTO_NATURA_PRESENTE);
      Banana.document.addMessage( msg, ID_ERR_XML_ELEMENTO_NATURA_PRESENTE);

    }
    else if (Banana.SDecimal.isZero(value) && jsonLine["DF_Natura"].length<=0) {
      var msg = getErrorMessage(ID_ERR_XML_ELEMENTO_NATURA_NONPRESENTE);
      var rowNumber = jsonLine["JRowOrigin"];
      //Banana.document.table('Transactions').addMessage(msg, rowNumber, "Transactions", ID_ERR_XML_ELEMENTO_NATURA_NONPRESENTE);
      Banana.document.addMessage( msg, ID_ERR_XML_ELEMENTO_NATURA_NONPRESENTE);
    }

    if (isCustomer) {
      if (!param.customers[accountId].rows)
        param.customers[accountId].rows = [];
      param.customers[accountId].rows.push(jsonLine);
    }
    else if (isSupplier) {
      if (!param.suppliers[accountId].rows)
        param.suppliers[accountId].rows = [];
      param.suppliers[accountId].rows.push(jsonLine);
    }
  }
  
  //Table FileInfo
  param.fileInfo = {};
  param.fileInfo["BasicCurrency"] = Banana.document.info("AccountingDataBase", "BasicCurrency");
  param.fileInfo["OpeningDate"] = Banana.document.info("AccountingDataBase", "OpeningDate");
  param.fileInfo["ClosureDate"] = Banana.document.info("AccountingDataBase", "ClosureDate");
  param.fileInfo["CustomersGroup"] = Banana.document.info("AccountingDataBase", "CustomersGroup");
  param.fileInfo["SuppliersGroup"] = Banana.document.info("AccountingDataBase", "SuppliersGroup");
  param.fileInfo["Address"] = {};
  param.fileInfo["Address"]["Company"] = Banana.document.info("AccountingDataBase", "Company");
  param.fileInfo["Address"]["Courtesy"] = Banana.document.info("AccountingDataBase", "Courtesy");
  param.fileInfo["Address"]["Name"] = Banana.document.info("AccountingDataBase", "Name");
  param.fileInfo["Address"]["FamilyName"] = Banana.document.info("AccountingDataBase", "FamilyName");
  param.fileInfo["Address"]["Address1"] = Banana.document.info("AccountingDataBase", "Address1");
  param.fileInfo["Address"]["Address2"] = Banana.document.info("AccountingDataBase", "Address2");
  param.fileInfo["Address"]["Zip"] = Banana.document.info("AccountingDataBase", "Zip");
  param.fileInfo["Address"]["City"] = Banana.document.info("AccountingDataBase", "City");
  param.fileInfo["Address"]["State"] = Banana.document.info("AccountingDataBase", "State");
  param.fileInfo["Address"]["Country"] = Banana.document.info("AccountingDataBase", "Country");
  param.fileInfo["Address"]["Web"] = Banana.document.info("AccountingDataBase", "Web");
  param.fileInfo["Address"]["Email"] = Banana.document.info("AccountingDataBase", "Email");
  param.fileInfo["Address"]["Phone"] = Banana.document.info("AccountingDataBase", "Phone");
  param.fileInfo["Address"]["Mobile"] = Banana.document.info("AccountingDataBase", "Mobile");
  param.fileInfo["Address"]["Fax"] = Banana.document.info("AccountingDataBase", "Fax");
  param.fileInfo["Address"]["FiscalNumber"] = Banana.document.info("AccountingDataBase", "FiscalNumber");
  param.fileInfo["Address"]["VatNumber"] = Banana.document.info("AccountingDataBase", "VatNumber");
  
  //debug
  /*var line = [];
  var transactions = [];
  for (var i = 0; i < filteredRows.length; i++) {
    var jsonObj = filteredRows[i];
    for (var key in jsonObj) {
      line.push(jsonObj[key]);
    }
    transactions.push(line);
    line = [];
  }
  line = [];
  var header = [];
  if (filteredRows.length>0) {
    var jsonObj = filteredRows[0];
    for (var key in jsonObj) {
      line.push(key);
    }
    header.push(line);
  }
  return tableToCsv(header.concat(transactions));*/
  
  return param;
  
}

function loadData_filterTransactions(row, index, table) {

  //only normal transaction with vat
  //OperationType_None = 0, OperationType_Opening = 1, OperationType_CarryForward = 2,
  //OperationType_Transaction = 3, OperationType_Closure = 4, OperationType_Total = 6
  var operationType = row.value("JOperationType");
  if (operationType && operationType != Banana.document.OPERATIONTYPE_TRANSACTION)
    return false;

  var isVatOperation = row.value("JVatIsVatOperation");
  if (isVatOperation)
    return false;
    
  return true;
}

function printVatReport1(report, stylesheet, param) {

  // Styles
  stylesheet.addStyle("@page", "size:landscape");
  stylesheet.addStyle("phead", "font-weight: bold; margin-bottom: 1em");
  stylesheet.addStyle("thead", "font-size: 8px; font-weight: bold");
  stylesheet.addStyle("td", "font-size: 8px; padding-right: 1em");
  stylesheet.addStyle(".amount", "text-align: right");
  stylesheet.addStyle(".period", "font-size: 10px; padding-top: 1em;padding-bottom: 1em;");
  stylesheet.addStyle(".vatNumber", "font-size: 10px");
  stylesheet.addStyle(".warning", "color: red;font-size:8px;");

  if (param.customers.length<=0 && param.suppliers.length<=0)
    return;

  //Print table
  var table = report.addTable("table1");

  // Print header
  var headerRow = table.getHeader().addRow();
  headerRow.addCell("Tipo");
  headerRow.addCell("Data");
  headerRow.addCell("Fatt.");
  headerRow.addCell("Descrizione");
  headerRow.addCell("Conto");
  headerRow.addCell("Ctrpart.");
  headerRow.addCell("Cod.IVA");
  headerRow.addCell("Lordo");
  headerRow.addCell("Imponibile");
  headerRow.addCell("Imposta");
  headerRow.addCell("Aliquota");
  headerRow.addCell("Deducibile");
  headerRow.addCell("Detraibile");
  headerRow.addCell("Natura");
  headerRow.addCell("IVA neg.");

  // Print data
  for (var i in param.customers) {
    for (var j in param.customers[i].rows) {
      var jsonObj = param.customers[i].rows[j];
      var row = table.addRow();
      row.addCell(jsonObj["DF_TipoDoc"]);
      row.addCell(jsonObj["JDate"]);
      row.addCell(jsonObj["DocInvoice"], "amount");
      row.addCell(jsonObj["JDescription"]);
      row.addCell(jsonObj["JAccount"], "amount");
      row.addCell(jsonObj["JContraAccount"], "amount");
      row.addCell(jsonObj["JVatCodeWithoutSign"], "amount");
      row.addCell(jsonObj["DF_Lordo"], "amount");
      row.addCell(jsonObj["DF_Imponibile"], "amount");
      row.addCell(jsonObj["DF_Imposta"], "amount");
      row.addCell(jsonObj["DF_Aliquota"], "amount");
      row.addCell(jsonObj["DF_Deducibile"], "amount");
      row.addCell(jsonObj["DF_Detraibile"], "amount");
      row.addCell(jsonObj["DF_Natura"], "amount");
      row.addCell(jsonObj["JVatNegative"], "amount");
    }
  }
  for (var i in param.suppliers) {
    for (var j in param.suppliers[i].rows) {
      var jsonObj = param.suppliers[i].rows[j];
      var row = table.addRow();
      row.addCell(jsonObj["DF_TipoDoc"]);
      row.addCell(jsonObj["JDate"]);
      row.addCell(jsonObj["DocInvoice"], "amount");
      row.addCell(jsonObj["JDescription"]);
      row.addCell(jsonObj["JAccount"], "amount");
      row.addCell(jsonObj["JContraAccount"], "amount");
      row.addCell(jsonObj["JVatCodeWithoutSign"], "amount");
      row.addCell(jsonObj["DF_Lordo"], "amount");
      row.addCell(jsonObj["DF_Imponibile"], "amount");
      row.addCell(jsonObj["DF_Imposta"], "amount");
      row.addCell(jsonObj["DF_Aliquota"], "amount");
      row.addCell(jsonObj["DF_Deducibile"], "amount");
      row.addCell(jsonObj["DF_Detraibile"], "amount");
      row.addCell(jsonObj["DF_Natura"], "amount");
      row.addCell(jsonObj["JVatNegative"], "amount");
    }
  }
}

function tableToCsv(table) {
    var result = "";
    for (var i = 0; i < table.length; i++) {
        var values = table[i];
        for (var j = 0; values && j < values.length; j++) {
            if (j > 0)
                result += ";";
            var value = values[j];
            result += value;
        }
        result += "\r\n";
    }
    return result;
}

function verifyParam(param) {
   if (!param.repStartDate)
     param.repStartDate = '';
   if (!param.repEndDate)
     param.repEndDate = '';
   if (!param.blocco)
     param.blocco = 'DTE';
   return param;
}
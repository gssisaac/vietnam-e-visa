/**
 * Orchestrates filling all e-Visa form sections from parsed YAML profile.
 */
(() => {
  if (globalThis.FormFiller) return;

  globalThis.FormFiller = (() => {
  function getH() {
    if (!globalThis.FieldHelpers) {
      throw new Error('FieldHelpers is not defined. Extension scripts may not have loaded in order.');
    }
    return globalThis.FieldHelpers;
  }

  async function runStep(name, fn, result) {
    try {
      globalThis.VietnamVisaLog?.step(name);
      await fn();
      result.filled += 1;
    } catch (err) {
      globalThis.VietnamVisaLog?.stepError(name, err);
      result.errors.push(`${name}: ${err.message}`);
    }
  }

  async function fillPersonal(data, result) {
    const p = data.personal_information || {};
    const H = getH();

    await runStep('surname', () => H.fillInput('basic_ttcnHo', p.surname), result);
    await runStep('given_name', () => H.fillInput('basic_ttcnDemVaTen', p.given_name), result);

    if (p.date_of_birth_mode) {
      await runStep('date_of_birth_mode', () => {
        const container = document.querySelector('.date-of-birth')?.closest('.grid')?.querySelector('.ant-radio-group');
        if (!container) throw new Error('Date of birth mode radio not found');
        const val = p.date_of_birth_mode === 'year_only' ? 'Y' : 'D';
        const radio = container.querySelector(`.ant-radio-input[value="${val}"]`);
        radio.closest('label')?.click();
      }, result);
    }

    await runStep('date_of_birth', () => H.fillAntDate('basic_ttcnNgayThangNamSinhStr', p.date_of_birth), result);
    await runStep('sex', () => H.fillAntSelect('basic_ttcnGioiTinh', p.sex, { searchable: false }), result);
    await runStep('nationality', () => H.fillAntSelect('basic_ttcnMaQt', p.nationality), result);
    await runStep('identity_card', () => H.fillInput('basic_ttcnCccd', p.identity_card), result);
    await runStep('email', () => H.fillInput('basic_ttcnEmail', p.email), result);

    if (p.agree_create_account !== undefined) {
      await runStep('agree_create_account', () => H.fillCheckboxByText('Agree to create account by email', p.agree_create_account), result);
    }

    await runStep('religion', () => H.fillInput('basic_ttcnTonGiao', p.religion), result);
    await runStep('place_of_birth', () => H.fillInput('basic_ttcnNoiSinh', p.place_of_birth), result);
    await runStep('confirm_email', () => H.fillInput('basic_ttcnConfirmEmail', p.email), result);

    if (p.used_other_passports !== undefined) {
      await runStep('used_other_passports', () => H.fillRadioByQuestion('Have you ever used any other passports', p.used_other_passports), result);
    }
    if (p.multiple_nationalities !== undefined) {
      await runStep('multiple_nationalities', () => H.fillRadioByQuestion('Do you have multiple nationalities', p.multiple_nationalities), result);
    }
    if (p.legal_violation !== undefined) {
      await runStep('legal_violation', () => H.fillRadioByQuestion('Violation of the Vietnamese laws', p.legal_violation), result);
    }
  }

  async function fillRequested(data, result) {
    const r = data.requested_information || {};
    const H = getH();

    if (r.entry_type) {
      await runStep('entry_type', () => H.fillRadioByName('#basic_nddnTtDeNghi', r.entry_type), result);
    }
    await runStep('valid_from', () => H.fillAntDate('basic_nddnTtdtTuNgayStr', r.valid_from), result);
    await runStep('valid_to', () => H.fillAntDate('basic_nddnTtdtDenNgayStr', r.valid_to), result);
  }

  async function fillPassport(data, result) {
    const p = data.passport_information || {};
    const H = getH();

    await runStep('passport_number', () => H.fillInput('basic_hcSo', p.number), result);
    await runStep('issuing_authority', () => H.fillInput('basic_hcNoiCap', p.issuing_authority), result);
    await runStep('passport_type', () => H.fillAntSelect('basic_hcLoai', p.type), result);
    await runStep('date_of_issue', () => H.fillAntDate('basic_hcNgayCapStr', p.date_of_issue), result);
    await runStep('expiry_date', () => H.fillAntDate('basic_hcGiaTriDenStr', p.expiry_date), result);

    if (p.other_valid_passports !== undefined) {
      await runStep('other_valid_passports', () => H.fillRadioByQuestion('Do you hold any other valid passports', p.other_valid_passports), result);
    }
  }

  async function fillContact(data, result) {
    const c = data.contact_information || {};
    const e = c.emergency_contact || {};
    const H = getH();

    await runStep('permanent_address', () => H.fillInput('basic_ttllDcThuongTru', c.permanent_address), result);
    await runStep('contact_address', () => H.fillInput('basic_ttllDcLienHe', c.contact_address), result);
    await runStep('telephone', () => H.fillInput('basic_ttllSdt', c.telephone), result);
    await runStep('emergency_name', () => H.fillInput('basic_ttllLlHoTen', e.full_name), result);
    await runStep('emergency_address', () => H.fillInput('basic_ttllLlNoiOHienTai', e.address), result);
    await runStep('emergency_phone', () => H.fillInput('basic_ttllLlSdt', e.telephone), result);
    await runStep('emergency_relationship', () => H.fillInput('basic_ttllLlQuanHe', e.relationship), result);
  }

  async function fillOccupation(data, result) {
    const o = data.occupation || {};
    const H = getH();

    if (o.occupation) {
      await runStep('occupation', () => H.fillAntSelect('basic_nnNgheNghiep', o.occupation, { searchable: false }), result);
    }
    await runStep('occupation_info', () => H.fillInput('basic_nnNgheNghiepHienTai', o.occupation_info), result);
    await runStep('company_name', () => H.fillInput('basic_nnTenCtyCq', o.company_name), result);
    await runStep('position', () => H.fillInput('basic_nnChucVu', o.position), result);
    await runStep('company_address', () => H.fillInput('basic_nnDiaChi', o.company_address), result);
    await runStep('company_phone', () => H.fillInput('basic_nnSdt', o.company_phone), result);
  }

  async function fillTrip(data, result) {
    const t = data.trip_information || {};
    const H = getH();

    await runStep('purpose_of_entry', () => H.fillAntSelect('basic_ttcdMucDich', t.purpose_of_entry), result);
    await runStep('intended_entry_date', () => H.fillAntDate('basic_ttcdThoiGianNcStr', t.intended_entry_date), result);
    await runStep('length_of_stay', () => H.fillInput('basic_ttcdSoNgayTamTru', t.length_of_stay_days), result);
    await runStep('phone_in_vietnam', () => H.fillInput('basic_ttcdSdt', t.phone_in_vietnam), result);
    await runStep('residential_address', () => H.fillAntAutoComplete('basic_ttcdDcTamTru', t.residential_address), result);

    if (t.province_city) {
      await runStep('province_city', () => H.fillAntSelect('basic_ttcdTinhTp', t.province_city), result);
      await H.sleep(1200);
    }

    if (t.ward_commune) {
      await runStep('ward_commune', async () => {
        await H.waitFor(() => {
          const input = document.getElementById('basic_ttcdPhuongXa');
          const select = input?.closest('.ant-select');
          return select && !select.classList.contains('ant-select-disabled');
        }, 5000);
        await H.fillAntSelect('basic_ttcdPhuongXa', t.ward_commune);
      }, result);
    }

    await runStep('border_gate_entry', () => H.fillAntSelect('basic_ttcdNcCuaKhau', t.border_gate_entry), result);
    await runStep('border_gate_exit', () => H.fillAntSelect('basic_ttcdXcCuaKhau', t.border_gate_exit), result);

    if (t.temporary_residence_commitment !== undefined) {
      await runStep('temporary_residence_commitment', () => H.fillCheckboxById('basic_ttcdCqTcCamDoan', t.temporary_residence_commitment), result);
    }
    if (t.contact_agency_in_vietnam !== undefined) {
      await runStep('contact_agency_in_vietnam', () => H.fillRadioByQuestion('Agency/Organization/Individual that the applicant plans to contact', t.contact_agency_in_vietnam), result);
    }
    if (t.visited_vietnam_last_year !== undefined) {
      await runStep('visited_vietnam_last_year', () => H.fillRadioByQuestion('Have you been to Viet Nam in the last 01 year', t.visited_vietnam_last_year), result);
      if (t.visited_vietnam_last_year) {
        await H.sleep(400);
        await fillVisitHistory(data, result);
      }
    }
    if (t.relatives_in_vietnam !== undefined) {
      await runStep('relatives_in_vietnam', () => H.fillRadioByQuestion('Do you have relatives who currently reside in Viet Nam', t.relatives_in_vietnam), result);
    }
  }

  async function fillVisitHistory(data, result) {
    const visits = data.vietnam_visits_last_year || [];
    const H = getH();

    if (!visits.length) {
      result.skipped.push('vietnam_visits_last_year (empty)');
      return;
    }

    const table = await H.waitFor(() => H.findVisitHistoryTable(), 5000);
    if (!table) {
      result.errors.push('visit_history: table not found after selecting Yes');
      return;
    }

    for (let i = 0; i < visits.length; i += 1) {
      const visit = visits[i];
      const prefix = `visit_${i + 1}`;

      if (i > 0) {
        await runStep(`${prefix}_add_row`, () => H.clickPlusVisitRow(), result);
        await H.sleep(300);
      }

      const rows = H.getTableDataRows(table);
      const row = rows[rows.length - 1];
      if (!row) {
        result.errors.push(`${prefix}: row not found`);
        continue;
      }

      await runStep(`${prefix}_from_date`, () => H.fillVisitHistoryRow(row, visit), result);
    }
  }

  async function fillChildren(data, result) {
    const children = data.accompanying_children || [];
    const H = getH();
    if (!children.length) {
      result.skipped.push('accompanying_children (empty)');
      return;
    }

    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      const prefix = `child_${i + 1}`;

      await runStep(`${prefix}_add_row`, () => H.clickPlusChildRow(), result);
      await H.sleep(300);

      const rows = [...document.querySelectorAll('.ant-table-tbody tr')].filter(
        (r) => !r.classList.contains('ant-table-measure-row') && !r.classList.contains('ant-table-placeholder')
      );
      const row = rows[rows.length - 1];
      if (!row) {
        result.errors.push(`${prefix}: row not found after add`);
        continue;
      }

      const inputs = row.querySelectorAll('input.ant-input');
      const selects = row.querySelectorAll('.ant-select-selection-search-input');
      const dateInputs = row.querySelectorAll('.ant-picker-input input');

      if (child.full_name && inputs[0]) {
        await runStep(`${prefix}_name`, async () => {
          nativeInputValueSetter.call(inputs[0], child.full_name);
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        }, result);
      }

      if (child.sex && selects[0]) {
        await runStep(`${prefix}_sex`, async () => {
          const id = selects[0].id || `child_sex_${i}`;
          if (!selects[0].id) selects[0].id = id;
          await H.fillAntSelect(id, child.sex, { searchable: false });
        }, result);
      }

      if (child.date_of_birth && dateInputs[0]) {
        await runStep(`${prefix}_dob`, async () => {
          dateInputs[0].removeAttribute('readonly');
          nativeInputValueSetter.call(dateInputs[0], child.date_of_birth);
          dateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          dateInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
          dateInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
        }, result);
      }

      result.skipped.push(`${prefix}_portrait (manual upload)`);
    }
  }

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;

  async function fillExpenses(data, result) {
    const e = data.trip_expenses || {};
    const H = getH();

    await runStep('intended_expenses', () => H.fillInput('basic_kpbhDuTinh', e.intended_expenses_usd), result);
    if (e.bought_insurance) {
      await runStep('bought_insurance', () => H.fillAntSelect('basic_kpbhMuaBaoHiem', e.bought_insurance, { searchable: false }), result);
    }
    if (e.expense_covered_by) {
      await runStep('expense_covered_by', () => H.fillAntSelect('basic_kpbhNguoiDamBao', e.expense_covered_by, { searchable: false }), result);
    }
  }

  async function fillDeclarations(data, result) {
    const d = data.declarations || {};
    const H = getH();
    if (d.final_declaration !== undefined) {
      await runStep('final_declaration', () => H.fillCheckboxByText('I hereby declare that the above statements are true', d.final_declaration), result);
    }
  }

  async function fillForm(profile) {
    getH();
    if (!globalThis.YamlParser) {
      throw new Error('YamlParser is not defined. Extension scripts may not have loaded in order.');
    }

    globalThis.VietnamVisaLog?.info('fillForm started');
    const result = { filled: 0, skipped: [], errors: [] };

    await fillPersonal(profile, result);
    await fillRequested(profile, result);
    await fillPassport(profile, result);
    await fillContact(profile, result);
    await fillOccupation(profile, result);
    await fillTrip(profile, result);
    await fillChildren(profile, result);
    await fillExpenses(profile, result);
    await fillDeclarations(profile, result);

    result.skipped.push('portrait_photo (manual upload)');
    result.skipped.push('passport_photo (manual upload)');

    globalThis.VietnamVisaLog?.info('fillForm completed', {
      filled: result.filled,
      errorCount: result.errors.length,
      skippedCount: result.skipped.length,
    });

    if (result.errors.length) {
      globalThis.VietnamVisaLog?.warn('fillForm errors', result.errors);
    }

    return result;
  }

  return { fillForm };
  })();
})();
